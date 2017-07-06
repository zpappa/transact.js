const expect = require("chai").expect;
const Transaction = require("./index").Transaction;
const TransactionItem = require("./index").TransactionItem;
const Promise = require("bluebird");

const emptyLogger = {
	log : () => {},
	error: () => {}
};

describe("transact.js", () => {

	describe("Transaction Item Creation", () => {
		it("Transaction Item can be created from two functions", () => {
			var item = null;
			try {
				item = new TransactionItem(function(){}, function(){});
			}
			catch(ex) { }
			expect(item).to.be.an.instanceOf(TransactionItem);
		});

		it("Transaction Item cannot be created from two non functions", () => {
			var item = null;
			try {
				item = new TransactionItem({}, function(){});
			}
			catch(ex) { }
			expect(item).to.be.null;
		});

		it("Transaction Item can be created from two functions with a given state", () => {
			var item = null;
			var state = { value: "mystate"};
			try {
				item = new TransactionItem(function(){}, function(){}, state);
			}
			catch(ex) { }
			expect(item).to.be.an.instanceOf(TransactionItem);
			expect(item.state.value).to.equal("mystate");
		})
	});

	describe("Transaction Item Management", () => {
		it("Adds an item to a transaction", () => {
			var testObject = {
				executed: false
			};

			var testForwardFunction = function() {
				testObject.executed = true;
			};

			var testReverseFunction = function() {
				testObject.executed = false;
			};

			var item = new TransactionItem(testForwardFunction, testReverseFunction);

			var transaction = new Transaction();
			transaction.add(item);
			expect(transaction.transactionItems.length).to.equal(1);
		});

		it("Clears the items from a transaction", () => {
			var testObject = {
				executed: false
			};

			var testForwardFunction = function() {
				testObject.executed = true;
			};

			var testReverseFunction = function() {
				testObject.executed = false;
			};

			var item = new TransactionItem(testForwardFunction, testReverseFunction);

			var transaction = new Transaction();
			transaction.add(item);
			transaction.clear();
			expect(transaction.transactionItems.length).to.equal(0);
		});
	});


	describe("Transaction Execution", () => {
		it("Transaction can execute in parallel", (done) => {
			var result = {
				item1: false,
				item2: false,
				item3: false,
				item4: false
			};
			var item1 = new TransactionItem(() => {
				result.item1 = true;
				return Promise.resolve();
			}, () => {
				result.item1 = false;
				return Promise.resolve();
			});

			var item2 = new TransactionItem(() => {
				result.item2 = true;
				return Promise.resolve();
			}, () => {
				result.item2 = false;
				return Promise.resolve();
			});

			var item3 = new TransactionItem(() => {
				result.item3 = true;
				return Promise.resolve();
			}, () => {
				result.item3 = false;
				return Promise.resolve();
			});

			var item4 = new TransactionItem(() => {
				result.item4 = true;
				return Promise.resolve();
			}, () => {
				result.item4 = false;
				return Promise.resolve();
			});

			var transaction = new Transaction(null, [item1, item2, item3, item4], emptyLogger);
			transaction.runParallel().then(() => {
				expect(result.item1).to.be.true;
				expect(result.item2).to.be.true;
				expect(result.item3).to.be.true;
				expect(result.item4).to.be.true;
				done();
			});
		});

		it("Transaction can fail to execute in parallel and rollback", (done) => {
			var result = {
				item1: false,
				item2: false
			};
			var item1 = new TransactionItem(() => {
				result.item1 = true;
				return Promise.resolve();
			}, () => {
				result.item1 = false;
				return Promise.resolve();
			});

			var item2 = new TransactionItem(() => {
				result.item2 = true;
				return Promise.reject();
			}, () => {
				result.item2 = false;
				return Promise.resolve();
			});

			var transaction = new Transaction(null, [item1, item2], emptyLogger);
			transaction.runParallel().catch((error) => {
				expect(result.item1).to.be.false;
				expect(result.item2).to.be.true;
				done();
			});
		});

		it("Transaction can fail to execute in parallel and rollback with an error", (done) => {
			var result = {
				item1: false,
				item2: false
			};
			var item1 = new TransactionItem(() => {
				result.item1 = true;
				return Promise.resolve();
			}, () => {
				result.item1 = false;
				return Promise.resolve();
			});

			var item2 = new TransactionItem(() => {
				result.item2 = true;
				return Promise.reject();
			}, () => {
				return Promise.reject();
			});

			var transaction = new Transaction(null, [item1, item2], emptyLogger);
			transaction.runParallel().catch((error) => {
				expect(result.item1).to.be.false;
				expect(result.item2).to.be.true;
				done();
			});
		});

		it("Transaction can execute single in serial", (done) => {
			var s = {
				counter: 0
			};

			var item1 = new TransactionItem((state) => {
				var s = state;
				s.counter = s.counter+5;
				return Promise.resolve(s);
			}, (state) => {
				var s = state;
				s.counter = s.counter+5;
				return Promise.resolve(s);
			}, s);

			var transaction = new Transaction(null, [item1], emptyLogger);
			transaction.runSerial().then((result) => {
				expect(s.counter).to.be.equal(5);
				expect(result.counter).to.be.equal(5);
				done();
			});
		});

		it("Transaction can execute multiple in serial", (done) => {
			var s = {
				counter: 0
			};

			var item1 = new TransactionItem((state) => {
				var s = state;
				s.counter = s.counter+5;
				return Promise.resolve(s);
			}, (state) => {
				var s = state;
				s.counter = s.counter-5;
				return Promise.resolve(s);
			}, s);

			var item2 = new TransactionItem((state) => {
				var s = state;
				s.counter = s.counter+25;
				return Promise.resolve(s);
			}, (state) => {
				var s = state;
				s.counter = s.counter-25;
				return Promise.resolve(s);
			}, s);

			var transaction = new Transaction(null, [item1, item2], emptyLogger);
			transaction.runSerial().then((result) => {
				//console.log(s);
				expect(s.counter).to.be.equal(30);
				expect(result.counter).to.be.equal(30);
				done();
			});
		});

		it("Transaction can fail to execute in serial and rollback", (done) => {
			var s = {
				counter: 0
			};

			var item1 = new TransactionItem((state) => {
				var s = state;
				s.counter = s.counter+5;
				return Promise.resolve(s);
			}, (state) => {
				var s = state;
				s.counter = s.counter-5;
				return Promise.resolve(s);
			}, s);

			var item2 = new TransactionItem((state) => {
				return Promise.reject(state);
			}, (state) => {
				var s = state;
				s.counter = s.counter-25;
				return Promise.resolve(s);
			}, s);

			var transaction = new Transaction(null, [item1, item2], emptyLogger);
			transaction.runSerial().catch((error) => {
				expect(s.counter).to.be.equal(0);
				done();
			});
		});

		it("Transaction can fail to execute in serial and rollback with an error", (done) => {
			var s = {
				counter: 0
			};

			var item1 = new TransactionItem((state) => {
				var s = state;
				s.counter = s.counter+5;
				return Promise.resolve(s);
			}, (state) => {
				var s = state;
				s.counter = s.counter-5;
				return Promise.resolve(s);
			}, s);

			var item2 = new TransactionItem((state) => {
				var s = state;
				s.counter = s.counter+10;
				return Promise.resolve(s);
			}, (state) => {
				var s = state;
				//s.counter = s.counter-10;
				return Promise.reject(s);
			}, s);

			var item3 = new TransactionItem((state) => {
				return Promise.reject(state);
			}, (state) => {
				var s = state;
				s.counter = s.counter-25;
				return Promise.resolve(s);
			}, s);

			var transaction = new Transaction(null, [item1, item2, item3], emptyLogger);
			transaction.runSerial().catch((error) => {
				expect(s.counter).to.be.equal(10);
				done();
			});
		});
	});
});