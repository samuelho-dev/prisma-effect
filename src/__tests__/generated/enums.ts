/**
 * Generated: 2025-10-04T06:47:17.360Z
 * DO NOT EDIT MANUALLY
 */

import { Schema } from 'effect';

export const Role = Schema.Literal('ADMIN', 'GUEST', 'USER');

export type Role = Schema.Schema.Type<typeof Role>;

export const Status = Schema.Literal('active', 'inactive', 'pending');

export type Status = Schema.Schema.Type<typeof Status>;
