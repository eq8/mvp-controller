/* globals define, Promise */
'use strict';

define([
	'lodash',
	'uuid/v4',
	'-/logger/index.js',
	'-/utils/index.js',
	'-/queue/index.js'
], (_, uuidv4, logger, { toImmutable }, queue) => {
	const plugin = {
		getQueries,
		getMethods,
		getActions,
		getTypeDefs,
		getResolvers
	};

	const LF = '\n';

	function getQueries() {
		return {
			isValid: {
				returnType: 'Boolean'
			}
		};
	}

	function getMethods() {
		return {
			isValid: {
				returnType: 'Boolean'
			}
		};
	}

	function getActions() {
		return {
			isValid: {
				returnType: 'Boolean'
			}
		};
	}

	function getTypeDefs(args) {
		const queries = _.assign({
			load: {
				returnType: 'Aggregate',
				params: {
					id: 'ID'
				}
			},
			transact: {
				returnType: 'Transaction',
				params: {
					id: 'ID'
				}
			}
		}, _.get(args, 'queries'));

		const methods = _.assign({
			version: {
				returnType: 'Int'
			}
		}, _.get(args, 'methods'));

		const actions = _.assign({
			id: {
				returnType: 'ID'
			},
			commit: {
				returnType: 'Aggregate',
				params: {
					options: 'CommitOptions'
				}
			}
		}, _.get(args, 'actions'));

		const typeDefQuery = getTypeDef('Query', queries);
		const typeDefAggregate = getTypeDef('Aggregate', methods);
		const typeDefTransaction = getTypeDef('Transaction', actions);

		const typeDef = `
"""
Sample documentation for Aggregate
"""
${typeDefAggregate}

${typeDefTransaction}

${typeDefQuery}

input CommitOptions {
	timeout: Int
}
`;

		return typeDef;
	}

	function getTypeDef(type, queries) {
		const queryDefs = getQueryDefs(queries);

		return `type ${type} {${LF}${queryDefs}${LF}}${LF}`;
	}

	function getQueryDefs(queries) {
		let typeDefinitionQueries = '';

		_.each(_.keys(queries || {}), name => {
			const query = _.get(queries, name);
			const params = getQueryParams(_.get(query, 'params'));
			const returnType = _.get(query, 'returnType') || 'Aggregate'; // TODO: remove and validate

			// TODO populate related <Entities>, Queries, Mutations
			typeDefinitionQueries = `${typeDefinitionQueries}${name}${params}: ${returnType}${LF}`;
		});

		return typeDefinitionQueries;
	}

	function getQueryParams(args) {
		let typeDefinitionQueryParams = '';

		_.each(_.keys(args), name => {

			// TODO: remove default and replace with validation
			const type = _.get(args, name) || 'Aggregate';

			typeDefinitionQueryParams = `${typeDefinitionQueryParams}${name}:${type},`;
		});

		return typeDefinitionQueryParams ? `(${typeDefinitionQueryParams})` : '';
	}

	function getResolvers(client, args) {

		return {
			Query: _.assign({
				load: getAggregate(client),
				transact: getTransaction(client)
			}, getQueryResolvers(args)),
			Aggregate: getAggregateResolvers(args),
			Transaction: _.assign({
				commit: setAggregate(client)
			}, getTransactionResolvers(client, args))
		};
	}

	function getAggregate(client) {
		return async(obj, args) => {
			logger.trace('resolver load:', args);

			const { id } = args;

			const root = await client.load(args, { create: true });
			const record = !_.isEmpty(root)
				? root
				: { id, version: 0 };

			logger.trace('resolver load result:', record);

			return toImmutable(record);
		};
	}

	function getTransaction(client) {
		return async(obj, args) => {
			const id = uuidv4();

			const root = await getAggregate(client)(null, args);

			await queue.enqueue(id, root);

			return { id };
		};
	}

	function setAggregate(client) {
		return async obj => {
			const { id } = obj || {};

			const fromQueue = await queue.dequeue(id);

			const changes = toImmutable({
				version: fromQueue.get('version') + 1,

				// TODO: create a meta provider
				meta: {
					lastUpdatedDate: new Date()
				}
			});

			const merged = fromQueue.mergeDeep(changes).toJSON();

			const saved = await client.save(merged);

			return toImmutable(saved);
		};
	}

	function getQueryResolvers() {
		return {};
	}

	function getAggregateResolvers() {
		return {
			version: obj => new Promise(resolve => resolve(obj.get('version') || 0))
		};
	}

	function getTransactionResolvers() {
		return {};
	}

	return plugin;
});
