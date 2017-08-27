'use strict';

module.exports = function pluginsLoader(commons) {
	const { logger, framework } = commons;

	logger.debug('pluginsLoader', __filename);

	return function loadPlugins({
		action, docker, domain, apiPath, port, store, dev
	}, done) {
		switch (action) {
		case 'deploy':
		case 'teardown':
			framework.use(require('./orchestrator'), { docker, port, dev });
			break;
		case 'process':
			framework.use(require('./processor')(commons));
			break;
		case 'serve':
		default:
			framework.use(require('./store'), { store });
			framework.use(require('./api'), { domain });
			framework.use(require('./graphql/admin')(commons));
			framework.use(require('./graphql')(commons), { domain });
			framework.use(require('./server')(commons), { apiPath, port });
			break;
		}

		done(framework);
	};
};
