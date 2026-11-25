#!/bin/bash
# Deux environnements Sillage sur le Mac de Bastien.
#   prod : port 3000, build .next, données data/ (invités), adresse publique https://<mac>.ts.net
#   test : port 3100, build .next-test, données data/test/ (copie), adresse https://<mac>.ts.net:8443, Bastien seul
#
#   scripts/sillage-env.sh status        état des deux serveurs et versions
#   scripts/sillage-env.sh test          build du code courant en test puis redémarrage du test
#   scripts/sillage-env.sh test-data     recopie les données de prod vers le test (test arrêté pendant la copie)
#   scripts/sillage-env.sh promote       passe en prod le commit courant (arbre propre exigé), avec retour arrière auto
#   scripts/sillage-env.sh rollback      remet la version de prod précédente
#   scripts/sillage-env.sh start-prod    relance la prod telle quelle (après un redémarrage du Mac)
#   scripts/sillage-env.sh start-test    relance le test tel quel
#
# Chaque build se fait dans un dossier à part puis remplace l'ancien d'un coup : le serveur en place
# n'est jamais servi à moitié construit. Seul le port visé est arrêté (jamais de pkill global).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
NEXT="$ROOT/node_modules/.bin/next"

pid_on() { lsof -tiTCP:"$1" -sTCP:LISTEN -n -P 2>/dev/null | head -1 || true; }

stop_port() {
  local pid; pid="$(pid_on "$1")"
  [ -z "$pid" ] && return 0
  kill "$pid"
  for _ in $(seq 1 50); do [ -z "$(pid_on "$1")" ] && return 0; sleep 0.2; done
  echo "Le serveur du port $1 ne s'arrête pas (PID $pid)." >&2; return 1
}

wait_up() {
  for _ in $(seq 1 60); do
    curl -fsS -o /dev/null "http://127.0.0.1:$1/api/ping" 2>/dev/null && return 0
    sleep 0.5
  done
  return 1
}

release_json() {
  local subject; subject="$(git log -1 --pretty=%s | cut -c1-120 | sed 's/\\/\\\\/g; s/"/\\"/g')"
  printf '{"commit":"%s","branch":"%s","subject":"%s","builtAt":"%s"}\n' "$(git rev-parse HEAD)" "$(git rev-parse --abbrev-ref HEAD)" "$subject" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

test_env() {
  export DATABASE_URL=file:./data/test/admin.db SILLAGE_REGISTRY_PATH=./data/test/sillage.db SILLAGE_PROFILES_DIR=./data/test/profiles SILLAGE_ENV=test
}

start_prod() {
  [ -n "$(pid_on 3000)" ] && { echo "Prod déjà lancée."; return 0; }
  (unset SILLAGE_ENV DATABASE_URL SILLAGE_REGISTRY_PATH SILLAGE_PROFILES_DIR NEXT_DIST_DIR; nohup "$NEXT" start -H 127.0.0.1 -p 3000 >> data/server-live.log 2>&1 &)
  wait_up 3000 && echo "Prod en ligne (port 3000)." || { echo "La prod ne répond pas : voir data/server-live.log" >&2; return 1; }
}

start_test() {
  [ -n "$(pid_on 3100)" ] && { echo "Test déjà lancé."; return 0; }
  (test_env; export NEXT_DIST_DIR=.next-test; nohup "$NEXT" start -H 127.0.0.1 -p 3100 >> data/test/server.log 2>&1 &)
  wait_up 3100 && echo "Test en ligne (port 3100)." || { echo "Le test ne répond pas : voir data/test/server.log" >&2; return 1; }
}

copy_db() { # copie cohérente d'une base SQLite ouverte (sauvegarde en ligne, lecture seule sur la source)
  rm -f "$2" "$2-wal" "$2-shm"
  sqlite3 "file:$1?mode=ro" ".backup '$2'"
}

case "${1:-status}" in
  status)
    echo "Prod : $( [ -n "$(pid_on 3000)" ] && echo "en ligne (PID $(pid_on 3000))" || echo "ARRÊTÉE" ) · $(cat data/prod-release.json 2>/dev/null || echo "version non relevée")"
    echo "Test : $( [ -n "$(pid_on 3100)" ] && echo "en ligne (PID $(pid_on 3100))" || echo "arrêté" ) · $(cat data/test/release.json 2>/dev/null || echo "version non relevée")"
    ;;
  test)
    rm -rf .next-test-staging
    (test_env; NEXT_DIST_DIR=.next-test-staging "$NEXT" build > data/test/build.log 2>&1) || { echo "Build de test en échec : data/test/build.log" >&2; exit 1; }
    stop_port 3100
    rm -rf .next-test-old; [ -d .next-test ] && mv .next-test .next-test-old
    mv .next-test-staging .next-test
    release_json > data/test/release.json
    start_test
    rm -rf .next-test-old
    ;;
  test-data)
    stop_port 3100
    stamp="$(date +%Y-%m-%d-%H%M)"
    mkdir -p "data/backups/test-$stamp"
    cp -p data/test/*.db data/test/profiles/*.db "data/backups/test-$stamp/" 2>/dev/null || true
    mkdir -p data/test/profiles
    copy_db data/run-insights.db data/test/admin.db
    copy_db data/sillage.db data/test/sillage.db
    for db in data/profiles/*.db; do copy_db "$db" "data/test/profiles/$(basename "$db")"; done
    printf '{"copiedAt":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > data/test/copied-at.json
    echo "Données de prod copiées vers le test (ancienne copie : data/backups/test-$stamp)."
    start_test
    ;;
  promote)
    [ -z "$(git status --porcelain --untracked-files=no -- . ':!next-env.d.ts')" ] || { echo "Arbre de travail modifié : commite avant de passer en prod." >&2; exit 1; }
    rm -rf .next-staging
    (unset SILLAGE_ENV DATABASE_URL SILLAGE_REGISTRY_PATH SILLAGE_PROFILES_DIR; NEXT_DIST_DIR=.next-staging "$NEXT" build > data/deploy-build.log 2>&1) || { echo "Build de prod en échec : data/deploy-build.log" >&2; exit 1; }
    stamp="$(date +%Y-%m-%d-%H%M)"
    for db in data/run-insights.db data/sillage.db; do copy_db "$db" "data/backups/$(basename "$db" .db)-$stamp-avant-promotion.db"; done
    stop_port 3000
    rm -rf .next-previous; [ -d .next ] && mv .next .next-previous
    mv .next-staging .next
    [ -f data/prod-release.json ] && cp data/prod-release.json data/prod-release.previous.json
    release_json > data/prod-release.json
    if ! start_prod; then
      echo "Retour à la version précédente." >&2
      stop_port 3000 || true
      rm -rf .next-failed; mv .next .next-failed; mv .next-previous .next
      [ -f data/prod-release.previous.json ] && cp data/prod-release.previous.json data/prod-release.json
      start_prod; exit 1
    fi
    ;;
  rollback)
    [ -d .next-previous ] || { echo "Aucune version précédente." >&2; exit 1; }
    stop_port 3000
    mv .next .next-rolled-back-tmp; mv .next-previous .next; rm -rf .next-previous; mv .next-rolled-back-tmp .next-previous
    if [ -f data/prod-release.previous.json ]; then mv data/prod-release.json data/prod-release.tmp.json; mv data/prod-release.previous.json data/prod-release.json; mv data/prod-release.tmp.json data/prod-release.previous.json; fi
    start_prod
    ;;
  start-prod) start_prod ;;
  start-test) start_test ;;
  *) sed -n 2,14p "$0"; exit 1 ;;
esac
