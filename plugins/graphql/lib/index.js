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
					id: 'String'
				}
			},
			transact: {
				returnType: 'Transaction',
				params: {
					id: 'String'
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
				returnType: 'String'
			},
			commit: {
				returnType: 'Aggregate',
				params: {
					readWrites: 'Boolean'
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
			Query: {
				load: getAggregate(client),
				transact: getTransaction(client)
			},
			Aggregate: getAggregateResolvers(args),
			Transaction: _.assign({
				commit: setAggregate(client)
			}, getTransactionResolvers(client, args))
		};
	}

	function getAggregate(client) {
		return (obj, args) => new Promise((resolve, reject) => {
			logger.trace('resolver load:', args);

			const { id } = args;

			client
				.load(args, { create: true })
				.then(result => {
					const record = !_.isEmpty(result)
						? result
						: { id, version: 0 };

					logger.trace('resolver load result:', record);
					resolve(toImmutable(record));
				}, reject);
		});
	}

	function getTransaction(client) {
		return (obj, args) => new Promise((resolve, reject) => {
			const id = uuidv4();

			getAggregate(client)(obj, args).then(result => {
				queue.queue(id, result).then(() => resolve({ id }), reject);
			}, reject);
		});
	}

	function setAggregate(client) {
		return obj => {
			const { id } = obj || {};

			return new Promise((resolve, reject) => {
				queue.dequeue(id).then(result => {
					logger.trace('result:', result.toJSON());

					const changes = toImmutable({
						version: result.get('version') + 1,
						meta: {
							lastUpdatedDate: new Date()
						}
					});

					const record = result.mergeDeep(changes).toJSON();

					logger.trace('commit', record);

					client.save(record)
						.then(resolve, reject);
				}, reject);
			});
		};
	}

	function getAggregateResolvers() {
		return {
			version: obj => new Promise(resolve => resolve(obj.version || 0))
		};
	}

	function getTransactionResolvers() {
		return {};
	}

	return plugin;
});
