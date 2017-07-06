const Promise = require ("bluebird");
const forEach = require("lodash.foreach");
const forEachRight = require("lodash.foreachright");
const isFunction = require("lodash.isfunction");

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
	 */
	constructor(forward, reverse, state) {
		if(!(isFunction(forward) && isFunction(reverse))) {
			throw TypeError("Forward and reverse parameters must be functions that return ES6 compatible promises.");
		}
		this.completed = false;
		this.state = state ? state : null;
		//this.state = state ? cloneDeep(state) : null;
		this.forward = forward;
		this.reverse = reverse;
	}

	/**
	 * Executes the transaction
	 * @param s - only passed in for serial transactions, this is ignored when running in parallel.
	 */
	exec(s) {
		return new Promise((resolve, reject) => {
			if(!this.completed) {
				this.state = s ? s : this.state;
				//this.state = s ? cloneDeep(s) : this.state;
				this.forward(this.state)
					.then((newState) => {
						this.state = newState;
						//this.state = cloneDeep(newState);
						this.completed = true;
						resolve(this.state);
					})
					.catch((error) => {
						reject("The transaction item failed to execute. "+errorAsString(error));
					})
			}
			else {
				reject("This is an executed transaction item and cannot be re-executed");
			}
		})
	}

	rollback() {
		return new Promise((resolve, reject) => {
			if(this.completed) {
				this.reverse(this.state)
					.then(()=> {
						this.completed = false;
						resolve();
					})
					.catch((error) => {
						reject("The transaction item failed to rollback. "+errorAsString(error));
					})
			}
		})
	}
}

/**
 * A transaction is a collection of transaction items that can be run serially or in parallel. Rollback operations always happen in parallel.
 */
class Transaction {

	/**
	 * Pass in a transaction id which defaults to epoch, and a logger which defaults to console.
	 * @param transactionId
	 * @param logger
	 */
	constructor(transactionId, transactionItems, logger) {
		this.transactionItems = (transactionItems && transactionItems.length) ? transactionItems : [];
		this.transactionId = transactionId ? transactionId : new Date().getTime()/1000;
		this.logger = logger ? logger : console;
	}

	/**
	 * Adds a transaction item to the ordered list.
	 * @param transactionItem
	 */
	add(transactionItem) {
		if(transactionItem instanceof TransactionItem) {
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
		forEachRight(this.transactionItems, (item) => {
			if(item.completed) {
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
	 */
	runParallel() {
		return new Promise((resolve, reject) => {
			this._log("Transaction executing.");
			let promises = [];
			forEach(this.transactionItems, (item) => {
				promises.push(item.exec());
			});
			Promise.all(promises)
				.then(() => {
					this._log("Transaction execution succeeded.");
					resolve();
				})
				.catch((error) => {
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
	 */
	runSerial() {
		return new Promise((resolve, reject) => {
			if(this.transactionItems.length>0) {
				this._log("Transaction executing.");
				Promise.reduce(this.transactionItems, (result, p) => {
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


}

function errorAsString(error) {
	return error ? error.toString() : "";
}

export {
	Transaction,
	TransactionItem
}
