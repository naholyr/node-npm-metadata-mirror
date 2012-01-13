
REPORTER = dot
OPTIONS =
MOCHA = ./node_modules/.bin/mocha --reporter $(REPORTER) --require should --ui bdd $(OPTIONS)

test: test-unit test-store-memory

test-unit:
	@$(MOCHA) test/*.js

test-all: test-unit test-store-all

test-store-all: test-store-memory test-store-mongo test-store-redis

test-store-memory:
	@$(MOCHA) test/store/memory.js

test-store-redis:
	@$(MOCHA) test/store/redis.js

test-store-mongo:
	@$(MOCHA) test/store/mongodb.js
