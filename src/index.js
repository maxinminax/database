/*
/*
 * @moleculer/database
 * Copyright (c) 2021 MoleculerJS (https://github.com/moleculerjs/database)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");

const Actions = require("./actions");
const DbMethods = require("./methods");
const Validation = require("./validation");
const Transform = require("./transform");
const {
	generateValidatorSchemaFromFields,
	getPrimaryKeyFromFields,
	fixIDInRestPath,
	fixIDInCacheKeys
} = require("./schema");
const pkg = require("../package.json");

/*

  TODO:

	- [x] Actions
		- [x] `find`
		- [x] `count`
		- [x] `list`
		- [x] `get` - receive only one entity
		- [x] `resolve` - receive one or multiple entities (with mapping)
		- [x] `create`
		- [x] `update`
		- [x] `replace`
		- [x] `remove`

	- [x] Field handlers
		- [x] `id` field with `secure` option: { id: true, type: "string", readonly: true, secure: true, columnName: "_id" }
		- [x] `columnName` support: { id: true, type: "string", columnName: "_id" }
		- [x] Sanitizers
			- [x] trim title: { type: "string", trim: true, maxlength: 50, required: true },
		- [x] set: custom set formatter: { set: (value, entity, field, ctx) => slug(entity.title) }
		- [x] get: custom get formatter: { get: (value, entity, field, ctx) => entity.firstName + ' ' + entity.lastName }
		- [x] default value: status: { type: "number", default: 1 } // Optional field with default value
		- [x] required: validation
		- [x] validate the type field with converting
		- [x] readonly: { type: "string", readonly: true } // Can't be set and modified
		- [x] hidden (password): password: { type: "string", hidden: true,
		  - [x] { hidden: "byDefault" | "always" == true } hide if it's not requested in `fields`.
		- [x] custom validator: { type: "string", validate: (value, entity, field, ctx) => value.length > 6 },	// Custom validator
		- [x] populate: { populate: { action: "v1.accounts.resolve", fields: ["id", "name", "avatar"] }
			- [x] using different field name
		- [x] immutable: { author: { type: "string", immutable: true } }
		- [x] permission: roles: { type: "array", permission: "administrator" } // Access control by permissions
		- [x] readPermission: { type: "array", populate: "v1.accounts.resolve", readPermission: ["$owner"] }
		- [x] onCreate: createdAt: { type: "number", readonly: true, onCreate: () => Date.now() }, // Set value when entity is created
		- [x] onUpdate: updatedAt: { type: "number", readonly: true, onUpdate: () => Date.now() }, // Set value when entity is updated
		- [x] onRemove: deletedAt: { type: "number", readonly: true, onRemove: () => Date.now() }, // Set value when entity is deleted
		- [ ] nested types

	- [x] Methods (internal with _ prefix)
		- [x] create indexes (execute the adapter)
		- [x] methods for actions (findEntities, getEntity, countEntities, createEntity, updateEntity, removeEntity)
		- [x] sanitizator
		- [x] transformer
		- [x] populate (default populates)
		- [x] scopes
		- [x] `find` with stream option  http://mongodb.github.io/node-mongodb-native/3.5/api/Cursor.html#stream

	- [x] Soft delete
	- [x] create validation from field definitions
	- [x] nested objects in fields.
	- [ ] change optional -> required like in fastest-validator
	- [x] Multi model/tenant solutions
		- [x] get connection/model dynamically
	- [ ] `aggregate` action with params: `type: "sum", "avg", "count", "min", "max"` & `field: "price"`
	- [ ] permissions for scopes
	- [ ] permissions for populates
	- [ ] ad-hoc populate in find/list actions `populate: ["author", { key: "createdBy", action: "users.resolve", fields: ["name", "avatar"] }]` { }
	- [ ] nested-et nem támogató adapter-ek warning-oljanak és flat-eljék az Object-t|Array-t JSON string-é és úgy tárolják le
	- [x] TEST: metódusok hívása `ctx` nélkül is mennie kell
	- [x] `strict: false|true|"remove"` mode in the mixinOptions. Using it in the validator schemas.
	- [x] convert the `$set` to flatten when it's needed
			https://github.com/moleculerjs/moleculer-db/blob/720d04160e5acdc5598437adb7b2b39b31462842/packages/moleculer-db/src/index.js#L893-L893
	- [ ] `bulkCreate` action without REST

	- [ ] Adapters
		- [ ] Cassandra
		- [ ] Couchbase
		- [ ] CouchDB
		- [ ] Knex (!)
		- [x] MongoDB
		- [ ] Mongoose
		- [x] NeDB
		- [ ] Sequelize

*/

module.exports = function DatabaseMixin(mixinOpts) {
	mixinOpts = _.defaultsDeep(mixinOpts, {
		/** @type {Boolean} Generate CRUD actions */
		createActions: true,

		/** @type {String} Default visibility of generated actions */
		actionVisibility: "published",

		/** @type {Boolean} Generate `params` schema for generated actions based on the `fields` */
		generateActionParams: true,

		/** @type {Boolean|String} Strict mode in validation schema for objects. Values: true|false|"remove" */
		strict: "remove",

		/** @type {Object} Caching settings */
		cache: {
			/** @type {Boolean} Enable caching of actions */
			enable: true,
			/** @type {String} Name of event for clearing cache */
			eventName: null
		},
		/** @type {Boolean} Set auto-aliasing fields */
		rest: true,

		/** @type {Number} Auto reconnect if the DB server is not available at first connecting */
		autoReconnect: true,

		/** @type {Number} Maximum value of limit in `find` action. Default: `-1` (no limit) */
		maxLimit: -1,

		/** @type {Number} Default page size in `list` action. */
		defaultPageSize: 10
	});

	const schema = {
		// Must overwrite it
		name: "",

		/**
		 * Metadata
		 */
		// Service's metadata
		metadata: {
			$category: "database",
			$description: "Official Data Access service",
			$official: true,
			$package: {
				name: pkg.name,
				version: pkg.version,
				repo: pkg.repository ? pkg.repository.url : null
			}
		},

		/**
		 * Default settings
		 */
		settings: {
			/** @type {Object?} Field filtering list. It must be an `Object`. If the value is `null` it won't filter the fields of entities. */
			fields: null,

			/** @type {Object?} Predefined scopes */
			scopes: {},

			/** @type {Array<String>?} Default scopes which applies to `find` & `list` actions */
			defaultScopes: null,

			/** @type {Object?} Adapter-specific index definitions */
			indexes: null
		},

		/**
		 * Actions
		 */
		actions: {
			...Actions(mixinOpts)
		},

		/**
		 * Methods
		 */
		methods: {
			...DbMethods(mixinOpts),
			...Transform(mixinOpts),
			...Validation(mixinOpts)
		},

		/**
		 * Create lifecycle hook of service
		 */
		created() {
			this.adapters = new Map();
		},

		/**
		 * Start lifecycle hook of service
		 */
		async started() {
			this._processFields();
		},

		/**
		 * Stop lifecycle hook of service
		 */
		async stopped() {
			return this.disconnectAll();
		},

		/**
		 * It is called when the Service schema mixins are merged. At this
		 * point, we can generate the validator schemas for the actions.
		 *
		 * @param {Object} schema
		 */
		merged(schema) {
			if (mixinOpts.createActions && schema.actions && schema.settings.fields) {
				const fields = schema.settings.fields;
				const primaryKeyField = getPrimaryKeyFromFields(fields);

				if (mixinOpts.generateActionParams) {
					// Generate action params
					if (Object.keys(fields).length > 0) {
						if (schema.actions.create) {
							schema.actions.create.params = generateValidatorSchemaFromFields(
								fields,
								{
									type: "create",
									strict: mixinOpts.strict
								}
							);
						}

						if (schema.actions.update) {
							schema.actions.update.params = generateValidatorSchemaFromFields(
								fields,
								{
									type: "update",
									strict: mixinOpts.strict
								}
							);
						}

						if (schema.actions.replace) {
							schema.actions.replace.params = generateValidatorSchemaFromFields(
								fields,
								{
									type: "replace",
									strict: mixinOpts.strict
								}
							);
						}
					}
				}

				if (primaryKeyField) {
					// Set `id` field name & type in `get` and `resolve` actions
					if (schema.actions.get && schema.actions.get.params) {
						schema.actions.get.params[primaryKeyField.name] = {
							type: primaryKeyField.type,
							convert: true
						};
					}
					if (schema.actions.resolve && schema.actions.resolve.params) {
						schema.actions.resolve.params[primaryKeyField.name] = [
							{ type: "array", items: { type: primaryKeyField.type, convert: true } },
							{ type: primaryKeyField.type, convert: true }
						];
					}

					// Fix the ":id" variable name in the actions
					fixIDInRestPath(schema.actions.get, primaryKeyField);
					fixIDInRestPath(schema.actions.update, primaryKeyField);
					fixIDInRestPath(schema.actions.replace, primaryKeyField);
					fixIDInRestPath(schema.actions.remove, primaryKeyField);

					// Fix the "id" key name in the cache keys
					fixIDInCacheKeys(schema.actions.get, primaryKeyField);
					fixIDInCacheKeys(schema.actions.resolve, primaryKeyField);
				}
			}
		}
	};

	if (mixinOpts.cache && mixinOpts.cache.enabled) {
		const eventName = mixinOpts.cache.eventName || `cache.clean.${this.name}`;
		schema.events = {
			/**
			 * Subscribe to the cache clean event. If it's triggered
			 * clean the cache entries for this service.
			 *
			 * @param {Context} ctx
			 */
			async [eventName]() {
				if (this.broker.cacher) {
					await this.broker.cacher.clean(`${this.fullName}.**`);
				}
			}
		};
	}

	return schema;
};
