import json
import sys
import os

def get_str(obj, key="value"):
    """Récupère une chaîne de façon sécurisée (que ce soit un str ou un dict)."""
    if isinstance(obj, str):
        return obj
    if isinstance(obj, dict):
        res = obj.get(key, "")
        if isinstance(res, str):
            return res
    return ""

def clean_copilot_export(input_file, output_file):
    print(f"Chargement de {input_file}...")
    with open(input_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    requests = data.get("requests", [])
    
    with open(output_file, "w", encoding="utf-8") as out:
        out.write("# Journal de bord Copilot (Résumé pour reprise)\n\n")
        
        for idx, req in enumerate(requests, 1):
            out.write(f"## Échange #{idx}\n\n")
            
            # --- 1. PROMPT UTILISATEUR ---
            out.write("### 👤 Prompt Utilisateur\n")
            pasted_texts = []
            
            # Variables et pastes
            var_data = req.get("variableData")
            if isinstance(var_data, dict):
                variables = var_data.get("variables", [])
                if isinstance(variables, list):
                    for var in variables:
                        if isinstance(var, dict):
                            val = var.get("value")
                            if isinstance(val, str) and val.strip():
                                pasted_texts.append(val.strip())
            
            if pasted_texts:
                for text in pasted_texts:
                    out.write(f"{text}\n\n")
            else:
                msg = req.get("message")
                user_msg = get_str(msg, "text") if isinstance(msg, dict) else str(msg or "")
                out.write(f"{user_msg.strip()}\n\n")
            
            # --- 2. ACTIONS & RÉPONSES COPILOT ---
            out.write("### 🤖 Actions & Réponses Copilot\n\n")
            responses = req.get("response", [])
            if not isinstance(responses, list):
                continue
                
            for item in responses:
                if not isinstance(item, dict):
                    continue
                
                kind = item.get("kind", "")
                
                # Explications textuelles de Copilot
                val = item.get("value")
                if isinstance(val, str) and val.strip() and kind != "thinking":
                    out.write(f"{val.strip()}\n\n")
                
                # Outils et commandes (Terminal, Lecture/Écriture)
                elif kind == "toolInvocationSerialized":
                    tool_id = str(item.get("toolId", ""))
                    invoc_msg = get_str(item.get("invocationMessage")) or str(item.get("generatedTitle", ""))
                    past_msg = get_str(item.get("pastTenseMessage"))
                    
                    # Commandes Terminal
                    tool_data = item.get("toolSpecificData")
                    if isinstance(tool_data, dict) and tool_data.get("kind") == "terminal":
                        cmd_line = tool_data.get("commandLine")
                        cmd = get_str(cmd_line, "original") if isinstance(cmd_line, dict) else str(cmd_line or "")
                        
                        out_data = tool_data.get("terminalCommandOutput")
                        out_text = get_str(out_data, "text") if isinstance(out_data, dict) else str(out_data or "")
                        
                        out.write(f"⚙️ **Commande exécutée :** `{cmd}`\n")
                        if out_text:
                            lines = out_text.strip().splitlines()
                            trimmed = "\n".join(lines[:10] + (["... [tronqué] ..."] if len(lines) > 15 else []) + lines[-5:])
                            out.write(f"```text\n{trimmed}\n```\n\n")
                    else:
                        label = past_msg or invoc_msg or tool_id
                        out.write(f"📄 **Action outil ({tool_id}) :** {label}\n\n")
                
                # Éditions de fichiers / diffs
                elif kind in ["fileEdit", "textEdit"]:
                    uri = item.get("uri")
                    path = get_str(uri, "path") if isinstance(uri, dict) else (item.get("path") or "")
                    diff = item.get("diff") or item.get("content") or ""
                    out.write(f"✏️ **Modification fichier :** `{path}`\n")
                    if diff:
                        out.write(f"```diff\n{diff}\n```\n\n")
            
            out.write("---\n\n")

    size_mb = os.path.getsize(output_file) / (1024 * 1024)
    print(f"Extraction terminée avec succès dans '{output_file}' ({size_mb:.2f} Mo)")

if __name__ == "__main__":
    input_filename = sys.argv[1] if len(sys.argv) > 1 else "trainer_copilot_save.json"
    output_filename = "copilot_summary.md"
    clean_copilot_export(input_filename, output_filename)
