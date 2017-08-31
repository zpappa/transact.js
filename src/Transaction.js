const Promise = require ("bluebird");
const TimeoutError = Promise.TimeoutError;
const forEach = require("lodash.foreach");
const forEachRight = require("lodash.foreachright");
const isFunction = require("lodash.isfunction");
const sortBy = require("lodash.sortby");

/**
 * A transaction item is effectively a step in the transaction process with a defined forward and backward movement
 * It can also be initialized with state.
 */
class TransactionItem {
	/**
	 * Forward and reverse functions passed in return ES6 promises, and take a single state object by reference
	 * @param forward
	 * @param reverse
	 * @param state
	 * @param name
	 * @param timeout - the time to wait on a rollback for the transaction to finish
	 */
	constructor(forward, reverse, state, name, timeout) {
		if(!(isFunction(forward) && isFunction(reverse))) {
			throw TypeError("Forward and reverse parameters must be functions that return ES6 compatible promises.");
		}

		this.completed = false;

		this.state = state ? state : null;
		this.forward = forward;
		this.reverse = reverse;
		this.name = name ? name : null;
		this.order = null;
		this.error = null;
		this.inRollback = false;
	}


	_start() {
		this._completed = [];
		this.completed = new Promise((resolve, reject) => {
			this._completed.push({resolve, reject})
		});

		this.complete = () => {
			this._completed[0].resolve(true);
		};

		this.incomplete = () =>{
			this._completed[0].resolve(false);
		};
	}
	/**
	 * Executes the transaction
	 * @param s - the state to utilize with the transaction, can be an object containing something the function may need but wasn't known ahead of time.
	 */
	exec(s) {
		return new Promise((resolve, reject) => {
			if(this.completed === false && !this.inRollback) {
				this._start();
				this.state = s ? s : this.state;
				this.forward(this.state)
					.then((newState) => {
						this.state = newState;
						this.complete();
						resolve(this.state);
					})
					.catch((error) => {
						this.error = error;
						this.incomplete();
						reject(this._addName("The transaction item failed to execute. "+errorAsString(error)));
					})
			}
			else {
				reject(this._addName("This is an executed transaction item and cannot be re-executed"));
			}
		})
	}

	rollback() {
		if(this.completed == false && !this.completed instanceof Promise) {
			this.inRollback = true;
			return Promise.resolve();
		}
		else { // this is either pending or resolved
			return new Promise((resolve, reject) => {
				let timeout = this.timeout ? this.timeout : 1000;
				this.completed.timeout(timeout).then((completed)=> {
					if(completed) {
						this.reverse(this.state)
							.then(()=> {
								this.completed = false;
								resolve();
							})
							.catch((error) => {
								reject(this._addName("The transaction item failed to rollback. "+errorAsString(error)));
							})
					}
					else {
						resolve();
					}
				}).catch((error)=> {
					if(error instanceof TimeoutError) {
						reject("The transaction item timed out");
					}
					else {
						reject(this._addName("The transaction item failed to execute. "+errorAsString(error)));
					}
				})
			})
		}
	}

	_addName(errorStr) {
		return this.name ? this.name +": "+errorStr : errorStr;
	}
}

/**
 * A transaction is a collection of transaction items that can be run serially or in parallel. Rollback operations always happen in parallel.
 */
class Transaction {

	/**
	 * Pass in a transaction id which defaults to epoch, and a logger which defaults to console.
	 * @param transactionId
	 * @param transactionItems
	 * @param logger
	 */
	constructor(transactionId, transactionItems, logger) {
		this.transactionItems = [];
		if(transactionItems && transactionItems.length) {
			for(let i=0;i<transactionItems.length;i++) {
				this.add(transactionItems[i]);
			}
			this.reorderItems();
		}

		this.transactionId = transactionId ? transactionId : new Date().getTime()/1000;
		this.logger = logger ? logger : console;
	}

	/**can you
	 * Adds a transaction item to the ordered list.
	 * @param transactionItem
	 */
	add(transactionItem) {
		if(transactionItem instanceof TransactionItem) {
			transactionItem.order = transactionItem.order ? transactionItem.order : this.transactionItems.length;
			this.transactionItems.push(transactionItem);
		}
		else {
			throw new TypeError("Supplied object is not a TransactionItem");
		}
	}

	/**
	 * Clears all transaction items from the transaction
	 */
	clear() {
		this.transactionItems = [];
	}

	/**
	 * Rolls back all transactions in parallel.
	 * @returns {Promise.<*>}
	 */
	rollbackAll() {
		let promises = [];
		let self = this;
		forEachRight(self.transactionItems, (item) => {
			if(!(self.completed === false && !self.completed instanceof Promise)) {
				promises.push(item.rollback());
			}
		});
		return Promise.all(promises);
	}

	_log(message) {
		this.logger.log(this.transactionId+": "+message);
	}

	_error(message) {
		this.logger.error(this.transactionId+": "+message);
	}

	/**
	 * Runs all transaction items in parallel.
	 * @param s - the state to utilize with ALL the transaction items, passed to ALL TransactionItem.exec() as the first argument.
	 */
	runParallel(s) {
		return new Promise((resolve, reject) => {
			this._log("Transaction executing.");
			let promises = [];
			forEach(this.transactionItems, (item) => {
				promises.push(item.exec(s));
			});
			Promise.all(promises)
				.then(() => {
					this._log("Transaction execution succeeded.");
					resolve();
				})
				.catch((error) => {
					// now have to go through all non-pending promises and imme
					this._error("Transaction failed. "+errorAsString(error));
					this.rollbackAll()
						.then(()=> {
							this._log("Transaction rolled back successfully.");
							reject(error);
						})
						.catch((error) => {
							this._error("Transaction failed to roll back. "+errorAsString(error));
							reject(error);
						})
				})

		});
	}

	/**
	 * Runs all transaction items in serial, chaining values from one call to the next
	 * @param s - the state to utilize for the INITIAL transaction item, passed to the INITIAL TransactionItem.exec() as the first argument.
	 */
	runSerial(s) {
		return new Promise((resolve, reject) => {
			if(this.transactionItems.length>0) {
				this._log("Transaction executing.");
				Promise.reduce(this.transactionItems, (result, p) => {
						result = p.order==0 ? s : result;
						return p.exec(result).then((newResult) => {
							return newResult;
						});
					}, null)
					.then((finalResult) => {
						this._log("Transaction execution succeeded.");
						resolve(finalResult);
					})
					.catch((error) => {
						this._log("Transaction failed. "+errorAsString(error));
						this.rollbackAll()
							.then(()=> {
								this._log("Transaction rolled back successfully.");
								reject(error);
							})
							.catch((error) => {
								this._error("Transaction failed to roll back. "+errorAsString(error));
								reject(error);
							})
					})
			}
		});
	}

	/**
	 * Produces a JSON string of the object
	 * @returns {String}
	 */
	serialize() {
		return JSON.stringify(this, null, 4);
	}

	/**
	 * Produces a new Transaction from a JSON string
	 * @param json
	 * @returns {Transaction}
	 */
	static deserialize(json) {
		let objectData = JSON.parse(json);
		let transaction = new Transaction();
		Object.assign(transaction, objectData);
		transaction.reorderItems();
		return transaction;
	}

	/**
	 * called by deserialize and on constructor
	 */
	reorderItems() {
		return sortBy(this.transactionItems, (ti) => ti.order)
	}

}

function errorAsString(error) {
	return error ? (typeof error === 'object' ? JSON.stringify(error, null, 4) : error) : error;
}

export {
	Transaction,
	TransactionItem
}
