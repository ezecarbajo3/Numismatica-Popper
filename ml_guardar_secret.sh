#!/bin/zsh
# Toma el Client Secret del portapapeles y arma ~/.ml-api-credentials.
# Copia primero el Secret desde el DevCenter de ML, despues corre este script.
set -e
SECRET="$(pbpaste | tr -d '[:space:]')"
if [ ${#SECRET} -lt 20 ]; then
  echo "El portapapeles no parece tener el Client Secret (largo ${#SECRET})." >&2
  echo "Copialo desde el DevCenter y volve a correr esto." >&2
  exit 1
fi
python3 - "$SECRET" <<'PY'
import json, os, stat, sys
ruta = os.path.expanduser("~/.ml-api-credentials")
json.dump({"client_id": "144192939073122",
           "client_secret": sys.argv[1],
           "redirect_uri": "https://numismaticapopper.com/"},
          open(ruta, "w"), indent=1)
os.chmod(ruta, stat.S_IRUSR | stat.S_IWUSR)
print(f"Guardado en {ruta} (secret de {len(sys.argv[1])} caracteres)")
PY
