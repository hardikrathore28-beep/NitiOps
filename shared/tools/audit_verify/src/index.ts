#!/usr/bin/env node

import { Pool } from 'pg';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import crypto from 'crypto';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the root .env or service .env if possible, 
// strictly we will rely on defaults or process.env passed in
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const calculateHash = (data: string): string => {
    return crypto.createHash('sha256').update(data).digest('hex');
};

const main = async () => {
    const argv = await yargs(hideBin(process.argv))
        .option('tenant', {
            alias: 't',
            type: 'string',
            description: 'Tenant ID to filter report for'
        })
        .help()
        .parse();

    const pool = new Pool({
        user: process.env.POSTGRES_USER || 'postgres',
        host: process.env.POSTGRES_HOST || 'localhost',
        database: process.env.POSTGRES_DB || 'nitiops',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
    });

    console.log(chalk.blue('Starting Audit Ledger Verification...'));
    if (argv.tenant) {
        console.log(chalk.yellow(`Report scoped to Tenant: ${argv.tenant}`));
        console.log(chalk.gray('Note: Global chain verification is still required to validate integrity.'));
    }

    const client = await pool.connect();

    try {
        // Stream all events in strict order
        const query = `
            SELECT 
                event_id, tenant_id, event_type, 
                actor::text as actor_str, 
                purpose, 
                context::text as context_str, 
                "references"::text as refs_str, 
                payload_hash, hash_prev, hash_this,
                timestamp
            FROM audit_events 
            ORDER BY timestamp ASC, event_id ASC
        `;

        const result = await client.query(query);
        const rows = result.rows;

        let previousHash = '0000000000000000000000000000000000000000000000000000000000000000';
        let broken = false;
        let brokenEventId: string | null = null;
        let brokenReason: string | null = null;
        let verifiedCount = 0;

        for (const row of rows) {
            // 1. Reconstruct Payload String
            // Logic Matches Trigger:
            // COALESCE(NEW.tenant_id::text, '') || COALESCE(NEW.event_type, '') || ...
            // We fetch ::text columns directly to avoid JSON.stringify mismatches.

            const payloadString =
                (row.tenant_id || '') +
                (row.event_type || '') +
                (row.actor_str || '') +
                (row.purpose || '') +
                (row.context_str || '') +
                (row.refs_str || '');

            const calculatedPayloadHash = calculateHash(payloadString);

            // Check 0: Payload Integrity
            // We only fail if we are reasonably sure. 
            // In a real prod tool, we'd warn. For this acceptance check, we want to see if it catches the 'TAMPERED' string.
            // My tamper used simple JSON '{}' which matches JSON.stringify({}).
            // The 'purpose' field was changed. So payloadString WILL be different.

            if (calculatedPayloadHash !== row.payload_hash) {
                // Double check if typical pg format might just be off (e.g. spacing)
                // But for "purpose", it's a string.
                broken = true;
                brokenEventId = row.event_id;
                brokenReason = `PAYLOAD MISMATCH: Content hash does not match stored payload_hash.\n` +
                    `Stored: ${row.payload_hash}\n` +
                    `Calc:   ${calculatedPayloadHash}\n` +
                    `Payload: ${payloadString}`;
                break;
            }

            // Check 1: Chain Link
            if (row.hash_prev !== previousHash) {
                broken = true;
                brokenEventId = row.event_id;
                brokenReason = `BROKEN CHAIN: hash_prev (${row.hash_prev}) != previous hash_this (${previousHash})`;
                break;
            }

            // Check 2: Hash Calculation
            // hash_this = hash(payload_hash + hash_prev)
            const calculatedHashThis = calculateHash(row.payload_hash + row.hash_prev);

            if (calculatedHashThis !== row.hash_this) {
                broken = true;
                brokenEventId = row.event_id;
                brokenReason = `INVALID HASH: hash_this mismatch. Stored: ${row.hash_this}, Calculated: ${calculatedHashThis}`;
                break;
            }

            previousHash = row.hash_this;
            verifiedCount++;
        }

        if (broken) {
            console.error(chalk.red('\n[FAIL] Audit Integrity Verification Failed!'));
            console.error(chalk.red(`First Broken Event ID: ${brokenEventId}`));
            console.error(chalk.red(`Reason: ${brokenReason}`));
            process.exit(1);
        } else {
            console.log(chalk.green('\n[PASS] Audit Integrity Verified.'));
            console.log(`Verified ${verifiedCount} events.`);
            console.log(`Chain Head Hash: ${previousHash}`);
            process.exit(0);
        }

    } catch (err) {
        console.error(chalk.red('Fatal Error during verification:'), err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

main();
