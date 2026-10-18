-- Runs once when the postgres container's data volume is first created
-- (mounted into /docker-entrypoint-initdb.d/). Creates the separate test
-- database and the read-only reporting role. Grants for ppfc_reader are
-- applied against real tables in feature 02's migrations.

CREATE DATABASE ppfc_test;

CREATE ROLE ppfc_reader WITH LOGIN PASSWORD 'ppfc_reader_pw';
