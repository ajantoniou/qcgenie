#!/usr/bin/env node
import { generateSecretEncryptionKey } from "../secrets.mjs";

console.log(generateSecretEncryptionKey());
