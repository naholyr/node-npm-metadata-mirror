
REPORTER = dot
OPTIONS =
MOCHA = ./node_modules/.bin/mocha --reporter $(REPORTER) --require should --ui bdd $(OPTIONS)
NPM = npm
REDIS = redis@~0.7.1 hiredis@~0.1.13
MONGO = mongodb@~0.9.7 --mongodb:native

test: test-unit test-store-memory

test-unit:
	@$(MOCHA) test/*.js

test-all: test-unit test-store-all

test-store-all: test-store-memory test-store-mongo test-store-redis

test-store-memory:
	@$(MOCHA) test/store/memory.js

test-store-redis: install-redis
	@$(MOCHA) test/store/redis.js

test-store-mongo: install-mongo
	@$(MOCHA) test/store/mongodb.js

install-redis:
	@if test ! -d node_modules/redis; then $(NPM) install $(REDIS); fi

install-mongo:
	@if test ! -d node_modules/mongodb; then $(NPM) install $(MONGO); fi
