import supertest from 'supertest';
import { buildApp } from '../../src/app.js';

// Fresh app instance per call — cheap, and keeps tests from accidentally
// sharing in-memory state across files.
export function api() {
  return supertest(buildApp());
}
