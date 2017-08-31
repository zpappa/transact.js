'use strict'
const expect = require("chai").expect;
const Transaction = require("./index").Transaction;
const TransactionItem = require("./index").TransactionItem;
const Promise = require("bluebird");

const logger = {
	log : () => {},
	error: () => {}
};

const loggerToUse = logger;

describe("transact.js", () => {

	describe("Transaction Item Creation", () => {
		it("Transaction Item can be created from two functions", () => {
			let item = null;
			try {
				item = new TransactionItem(function(){}, function(){});
			}
			catch(ex) { }
			expect(item).to.be.an.instanceOf(TransactionItem);
		});

		it("Transaction Item cannot be created from two non functions", () => {
			let item = null;
			try {
				item = new TransactionItem({}, function(){});
			}
			catch(ex) { }
			expect(item).to.be.null;
		});

		it("Transaction Item can be created from two functions with a given state", () => {
			let item = null;
			let state = { value: "mystate"};
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
			let testObject = {
				executed: false
			};

			let testForwardFunction = function() {
				testObject.executed = true;
			};

			let testReverseFunction = function() {
				testObject.executed = false;
			};

			let item = new TransactionItem(testForwardFunction, testReverseFunction);

			let transaction = new Transaction();
			transaction.add(item);
			expect(transaction.transactionItems.length).to.equal(1);
		});

		it("Clears the items from a transaction", () => {
			let testObject = {
				executed: false
			};

			let testForwardFunction = function() {
				testObject.executed = true;
			};

			let testReverseFunction = function() {
				testObject.executed = false;
			};

			let item = new TransactionItem(testForwardFunction, testReverseFunction);

			let transaction = new Transaction();
			transaction.add(item);
			transaction.clear();
			expect(transaction.transactionItems.length).to.equal(0);
		});
	});


	describe("Transaction Execution", () => {
		it("Transaction can execute in parallel", (done) => {
			let result = {
				item1: false,
				item2: false,
				item3: false,
				item4: false
			};

			let item1 = new TransactionItem(() => {
				result.item1 = true;
				return Promise.resolve();
			}, () => {
				result.item1 = false;
				return Promise.resolve();
			});

			let item2 = new TransactionItem(() => {
				result.item2 = true;
				return Promise.resolve();
			}, () => {
				result.item2 = false;
				return Promise.resolve();
			});

			let item3 = new TransactionItem(() => {
				result.item3 = true;
				return Promise.resolve();
			}, () => {
				result.item3 = false;
				return Promise.resolve();
			});

			let item4 = new TransactionItem(() => {
				result.item4 = true;
				return Promise.resolve();
			}, () => {
				result.item4 = false;
				return Promise.resolve();
			});

			let transaction = new Transaction(null, [item1, item2, item3, item4], loggerToUse);
			transaction.runParallel().then(() => {
				expect(result.item1).to.be.true;
				expect(result.item2).to.be.true;
				expect(result.item3).to.be.true;
				expect(result.item4).to.be.true;
				done();
			});
		});

		it("Transaction can execute in parallel with an initialized state", (done) => {
			let result = {
				item1: false,
				item2: false,
				item3: false,
				item4: false
			};

			let initState = {
				item1: 1
			};

			let item1 = new TransactionItem((state) => {
				result.item1 = state.item1;
				return Promise.resolve();
			}, () => {
				result.item1 = false;
				return Promise.resolve();
			});

			let item2 = new TransactionItem((state) => {
				result.item2 = true;
				return Promise.resolve();
			}, () => {
				result.item2 = false;
				return Promise.resolve();
			});

			let item3 = new TransactionItem((state) => {
				result.item3 = true;
				return Promise.resolve();
			}, () => {
				result.item3 = false;
				return Promise.resolve();
			});

			let item4 = new TransactionItem((state) => {
				result.item4 = true;
				return Promise.resolve();
			}, () => {
				result.item4 = false;
				return Promise.resolve();
			});

			let transaction = new Transaction(null, [item1, item2, item3, item4], loggerToUse);
			transaction.runParallel(initState).then(() => {
				expect(result.item1).to.be.equal(1);
				expect(result.item2).to.be.true;
				expect(result.item3).to.be.true;
				expect(result.item4).to.be.true;
				done();
			});
		});

		it("Transaction can fail to execute in parallel and rollback", (done) => {
			let result = {
				item1: false,
				item2: false
			};

			let item1 = new TransactionItem(() => {
				result.item1 = true;
				return Promise.resolve();
			}, () => {
				result.item1 = false;
				return Promise.resolve();
			});

			let item2 = new TransactionItem(() => {
				return Promise.reject();
			}, () => {
				return Promise.resolve();
			});

			let transaction = new Transaction(null, [item1, item2], loggerToUse);
			transaction.runParallel().catch((error) => {
				expect(result.item1).to.be.false;
				expect(result.item2).to.be.false
				done();
			});
		});

		it("Transaction fails to execute in parallel and rollback with one or more items taking longer than the others to be forward complete.", (done) => {
			let result = {
				item1: false,
				item2: false,
				item3: false
			};
			let item1 = new TransactionItem(() => {
				result.item1 = true;
				return Promise.resolve();
			}, () => {
				result.item1 = false;
				return Promise.resolve();
			});

			let item2 = new TransactionItem(() => {
				return Promise.reject();
			}, () => {
				result.item2 = false;
				return Promise.resolve();
			});

			let item3 = new TransactionItem(() => {
				return new Promise((resolve, reject)=> {
					setTimeout(()=> {
						result.item3=true;
						resolve();
					}, 1700);
				});
			}, () => {
				return Promise.resolve();
			}, null, "Long running item", 2000);

			let transaction = new Transaction(null, [item1, item2, item3], loggerToUse);
			transaction.runParallel().catch((error) => {
				expect(result.item1).to.be.false;
				expect(result.item2).to.be.false;
				expect(result.item3).to.be.false;
				done();
			});
		}).timeout(5000);

		it("Transaction can fail to execute in parallel and rollback with an error", (done) => {
			let result = {
				item1: false,
				item2: false
			};
			let item1 = new TransactionItem(() => {
				result.item1 = true;
				return Promise.resolve();
			}, () => {
				result.item1 = false;
				return Promise.resolve();
			});

			let item2 = new TransactionItem(() => {
				result.item2 = true;
				return Promise.reject();
			}, () => {
				return Promise.reject();
			});

			let transaction = new Transaction(null, [item1, item2], loggerToUse);
			transaction.runParallel().catch((error) => {
				expect(result.item1).to.be.false;
				expect(result.item2).to.be.true;
				done();
			});
		});

		it("Transaction can execute single in serial", (done) => {
			let s = {
				counter: 0
			};

			let item1 = new TransactionItem((state) => {
				let s = state;
				s.counter = s.counter+5;
				return Promise.resolve(s);
			}, (state) => {
				let s = state;
				s.counter = s.counter+5;
				return Promise.resolve(s);
			}, s);

			let transaction = new Transaction(null, [item1], loggerToUse);
			transaction.runSerial().then((result) => {
				expect(s.counter).to.be.equal(5);
				expect(result.counter).to.be.equal(5);
				done();
			});
		});

		it("Transaction can execute single in serial with an initialized state", (done) => {
			let s = {
				counter: 500
			};

			let item1 = new TransactionItem((state) => {
				state.counter = state.counter+5;
				return Promise.resolve(state);
			}, (state) => {
				state.counter = state.counter-5;
				return Promise.resolve(state);
			}, s);

			let transaction = new Transaction(null, [item1], loggerToUse);
			transaction.runSerial(s).then((result) => {
				expect(s.counter).to.be.equal(505);
				expect(result.counter).to.be.equal(505);
				done();
			});
		});

		it("Transaction can execute multiple in serial", (done) => {
			let s = {
				counter: 0
			};

			let item1 = new TransactionItem((state) => {
				let s = state;
				s.counter = s.counter+5;
				return Promise.resolve(s);
			}, (state) => {
				let s = state;
				s.counter = s.counter-5;
				return Promise.resolve(s);
			}, s);

			let item2 = new TransactionItem((state) => {
				let s = state;
				s.counter = s.counter+25;
				return Promise.resolve(s);
			}, (state) => {
				let s = state;
				s.counter = s.counter-25;
				return Promise.resolve(s);
			}, s);

			let transaction = new Transaction(null, [item1, item2], loggerToUse);
			transaction.runSerial().then((result) => {
				expect(s.counter).to.be.equal(30);
				expect(result.counter).to.be.equal(30);
				done();
			});
		});
		it("Transaction can execute multiple in serial with an initialized state", (done) => {
			let r = {
				counter: 500
			};

			let item1 = new TransactionItem((state) => {
				let s = state;
				s.counter = s.counter+5;
				return Promise.resolve(s);
			}, (state) => {
				let s = state;
				s.counter = s.counter-5;
				return Promise.resolve(s);
			}, null, "Add");

			let item2 = new TransactionItem((state) => {
				let s = state;
				s.counter = parseInt(s.counter)*25;
				return Promise.resolve(s);
			}, (state) => {
				let s = state;
				s.counter = parseInt(s.counter)/25;
				return Promise.resolve(s);
			}, null, "Multiply");

			let transaction = new Transaction(null, [item1,item2], loggerToUse);
			transaction.runSerial(r).then((result) => {
				expect(r.counter).to.be.equal(12625);
				expect(result.counter).to.be.equal(12625);
				done();
			});
		});

		it("Transaction can fail to execute in serial and rollback", (done) => {
			let s = {
				counter: 0
			};

			let item1 = new TransactionItem((state) => {
				let s = state;
				s.counter = s.counter+5;
				return Promise.resolve(s);
			}, (state) => {
				let s = state;
				s.counter = s.counter-5;
				return Promise.resolve(s);
			}, s);

			let item2 = new TransactionItem((state) => {
				return Promise.reject(state);
			}, (state) => {
				let s = state;
				s.counter = s.counter-25;
				return Promise.resolve(s);
			}, s);

			let transaction = new Transaction(null, [item1, item2], loggerToUse);
			transaction.runSerial().catch((error) => {
				expect(s.counter).to.be.equal(0);
				done();
			});
		});

		it("Transaction can fail to execute in serial and rollback with an error", (done) => {
			let s = {
				counter: 0
			};

			let item1 = new TransactionItem((state) => {
				let s = state;
				s.counter = s.counter+5;
				return Promise.resolve(s);
			}, (state) => {
				let s = state;
				s.counter = s.counter-5;
				return Promise.resolve(s);
			}, s);

			let item2 = new TransactionItem((state) => {
				let s = state;
				s.counter = s.counter+10;
				return Promise.resolve(s);
			}, (state) => {
				let s = state;
				//s.counter = s.counter-10;
				return Promise.reject(s);
			}, s);

			let item3 = new TransactionItem((state) => {
				return Promise.reject(state);
			}, (state) => {
				let s = state;
				s.counter = s.counter-25;
				return Promise.resolve(s);
			}, s);

			let transaction = new Transaction(null, [item1, item2, item3], loggerToUse);
			transaction.runSerial().catch((error) => {
				expect(s.counter).to.be.equal(10);
				done();
			});
		});
	});
});