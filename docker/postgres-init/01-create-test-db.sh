#!/bin/sh
# Runs on first postgres volume initialization (docker-entrypoint-initdb.d).
# The API uses `taskforge` (POSTGRES_DB); the integration suite uses the
# isolated `taskforge_test` database, which is created here so tests never
# touch dev/production data.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
    CREATE DATABASE taskforge_test;
EOSQL