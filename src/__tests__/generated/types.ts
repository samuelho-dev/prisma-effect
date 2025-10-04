/**
 * Generated: 2025-10-04T06:47:17.361Z
 * DO NOT EDIT MANUALLY
 */

import { Schema } from 'effect';
import { columnType, generated, getSchemas } from 'prisma-effect-kysely';
import { Role, Status } from './enums';

// AllTypes Base Schema
export const _AllTypes = Schema.Struct({
  bigIntArray: Schema.Array(Schema.BigInt),
  bigIntField: Schema.BigInt,
  boolArray: Schema.Array(Schema.Boolean),
  boolField: Schema.Boolean,
  bytesArray: Schema.Array(Schema.Uint8Array),
  bytesField: Schema.Uint8Array,
  createdAt: generated(Schema.Date),
  cuidField: generated(Schema.String),
  dateArray: Schema.Array(Schema.Date),
  dateField: Schema.Date,
  decimalArray: Schema.Array(Schema.String),
  decimalField: Schema.String,
  floatArray: Schema.Array(Schema.Number),
  floatField: Schema.Number,
  id: columnType(Schema.UUID, Schema.Never, Schema.Never),
  intArray: Schema.Array(Schema.Number),
  intField: Schema.Number,
  jsonArray: Schema.Array(Schema.Unknown),
  jsonField: Schema.Unknown,
  mappedField: Schema.propertySignature(Schema.String).pipe(Schema.fromKey('db_mapped_field')),
  mappedWithDefault: Schema.propertySignature(generated(Schema.Number)).pipe(
    Schema.fromKey('mapped_default')
  ),
  optionalBigInt: Schema.UndefinedOr(Schema.BigInt),
  optionalBool: Schema.UndefinedOr(Schema.Boolean),
  optionalBytes: Schema.UndefinedOr(Schema.Uint8Array),
  optionalDate: Schema.UndefinedOr(Schema.Date),
  optionalDecimal: Schema.UndefinedOr(Schema.String),
  optionalFloat: Schema.UndefinedOr(Schema.Number),
  optionalInt: Schema.UndefinedOr(Schema.Number),
  optionalJson: Schema.UndefinedOr(Schema.Unknown),
  optionalRole: Schema.UndefinedOr(Role),
  optionalStatus: Schema.UndefinedOr(Status),
  optionalString: Schema.UndefinedOr(Schema.String),
  role: Role,
  roleArray: Schema.Array(Role),
  session_id: generated(Schema.UUID),
  status: Status,
  statusArray: Schema.Array(Status),
  stringArray: Schema.Array(Schema.String),
  stringField: Schema.String,
  tenant_id: Schema.UUID,
  ulidField: generated(Schema.String),
  uniqueEmail: Schema.String,
  updatedAt: Schema.Date,
});

export const AllTypes = getSchemas(_AllTypes);

export type AllTypesSelect = Schema.Schema.Type<typeof AllTypes.Selectable>;
export type AllTypesInsert = Schema.Schema.Type<typeof AllTypes.Insertable>;
export type AllTypesUpdate = Schema.Schema.Type<typeof AllTypes.Updateable>;

// Category Base Schema
export const _Category = Schema.Struct({
  id: columnType(Schema.UUID, Schema.Never, Schema.Never),
  name: Schema.String,
});

export const Category = getSchemas(_Category);

export type CategorySelect = Schema.Schema.Type<typeof Category.Selectable>;
export type CategoryInsert = Schema.Schema.Type<typeof Category.Insertable>;
export type CategoryUpdate = Schema.Schema.Type<typeof Category.Updateable>;

// CompositeIdModel Base Schema
export const _CompositeIdModel = Schema.Struct({
  postId: Schema.UUID,
  timestamp: generated(Schema.Date),
  userId: Schema.UUID,
});

export const CompositeIdModel = getSchemas(_CompositeIdModel);

export type CompositeIdModelSelect = Schema.Schema.Type<typeof CompositeIdModel.Selectable>;
export type CompositeIdModelInsert = Schema.Schema.Type<typeof CompositeIdModel.Insertable>;
export type CompositeIdModelUpdate = Schema.Schema.Type<typeof CompositeIdModel.Updateable>;

// Employee Base Schema
export const _Employee = Schema.Struct({
  id: columnType(Schema.UUID, Schema.Never, Schema.Never),
  managerId: Schema.UndefinedOr(Schema.UUID),
  name: Schema.String,
});

export const Employee = getSchemas(_Employee);

export type EmployeeSelect = Schema.Schema.Type<typeof Employee.Selectable>;
export type EmployeeInsert = Schema.Schema.Type<typeof Employee.Insertable>;
export type EmployeeUpdate = Schema.Schema.Type<typeof Employee.Updateable>;

// Post Base Schema
export const _Post = Schema.Struct({
  authorId: Schema.UUID,
  content: Schema.UndefinedOr(Schema.String),
  createdAt: generated(Schema.Date),
  id: columnType(Schema.UUID, Schema.Never, Schema.Never),
  published: generated(Schema.Boolean),
  title: Schema.String,
  updatedAt: Schema.Date,
});

export const Post = getSchemas(_Post);

export type PostSelect = Schema.Schema.Type<typeof Post.Selectable>;
export type PostInsert = Schema.Schema.Type<typeof Post.Insertable>;
export type PostUpdate = Schema.Schema.Type<typeof Post.Updateable>;

// Profile Base Schema
export const _Profile = Schema.Struct({
  bio: Schema.String,
  id: columnType(Schema.UUID, Schema.Never, Schema.Never),
  userId: Schema.UUID,
});

export const Profile = getSchemas(_Profile);

export type ProfileSelect = Schema.Schema.Type<typeof Profile.Selectable>;
export type ProfileInsert = Schema.Schema.Type<typeof Profile.Insertable>;
export type ProfileUpdate = Schema.Schema.Type<typeof Profile.Updateable>;

// User Base Schema
export const _User = Schema.Struct({
  createdAt: generated(Schema.Date),
  email: Schema.String,
  id: columnType(Schema.UUID, Schema.Never, Schema.Never),
  name: Schema.String,
  updatedAt: Schema.Date,
});

export const User = getSchemas(_User);

export type UserSelect = Schema.Schema.Type<typeof User.Selectable>;
export type UserInsert = Schema.Schema.Type<typeof User.Insertable>;
export type UserUpdate = Schema.Schema.Type<typeof User.Updateable>;

// Kysely Database Interface
export interface DB {
  AllTypes: Schema.Schema.Encoded<typeof _AllTypes>;
  Category: Schema.Schema.Encoded<typeof _Category>;
  composite_id_table: Schema.Schema.Encoded<typeof _CompositeIdModel>;
  Employee: Schema.Schema.Encoded<typeof _Employee>;
  Post: Schema.Schema.Encoded<typeof _Post>;
  Profile: Schema.Schema.Encoded<typeof _Profile>;
  User: Schema.Schema.Encoded<typeof _User>;
}
