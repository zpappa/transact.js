"use strict";

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Promise = require("bluebird");
var forEach = require("lodash.foreach");
var forEachRight = require("lodash.foreachright");
var isFunction = require("lodash.isfunction");

/**
 * A transaction item is effectively a step in the transaction process with a defined forward and backward movement
 * It can also be initialized with state.
 */

var TransactionItem = function () {
	/**
  * Forward and reverse functions passed in return ES6 promises, and take a single state object by reference
  * @param forward
  * @param reverse
  * @param state
  */
	function TransactionItem(forward, reverse, state) {
		_classCallCheck(this, TransactionItem);

		if (!(isFunction(forward) && isFunction(reverse))) {
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


	_createClass(TransactionItem, [{
		key: "exec",
		value: function exec(s) {
			var _this = this;

			return new Promise(function (resolve, reject) {
				if (!_this.completed) {
					_this.state = s ? s : _this.state;
					//this.state = s ? cloneDeep(s) : this.state;
					_this.forward(_this.state).then(function (newState) {
						_this.state = newState;
						//this.state = cloneDeep(newState);
						_this.completed = true;
						resolve(_this.state);
					}).catch(function (error) {
						reject("The transaction item failed to execute. " + errorAsString(error));
					});
				} else {
					reject("This is an executed transaction item and cannot be re-executed");
				}
			});
		}
	}, {
		key: "rollback",
		value: function rollback() {
			var _this2 = this;

			return new Promise(function (resolve, reject) {
				if (_this2.completed) {
					_this2.reverse(_this2.state).then(function () {
						_this2.completed = false;
						resolve();
					}).catch(function (error) {
						reject("The transaction item failed to rollback. " + errorAsString(error));
					});
				}
			});
		}
	}]);

	return TransactionItem;
}();

/**
 * A transaction is a collection of transaction items that can be run serially or in parallel. Rollback operations always happen in parallel.
 */


var Transaction = function () {

	/**
  * Pass in a transaction id which defaults to epoch, and a logger which defaults to console.
  * @param transactionId
  * @param logger
  */
	function Transaction(transactionId, transactionItems, logger) {
		_classCallCheck(this, Transaction);

		this.transactionItems = transactionItems && transactionItems.length ? transactionItems : [];
		this.transactionId = transactionId ? transactionId : new Date().getTime() / 1000;
		this.logger = logger ? logger : console;
	}

	/**
  * Adds a transaction item to the ordered list.
  * @param transactionItem
  */


	_createClass(Transaction, [{
		key: "add",
		value: function add(transactionItem) {
			if (transactionItem instanceof TransactionItem) {
				this.transactionItems.push(transactionItem);
			} else {
				throw new TypeError("Supplied object is not a TransactionItem");
			}
		}

		/**
   * Clears all transaction items from the transaction
   */

	}, {
		key: "clear",
		value: function clear() {
			this.transactionItems = [];
		}

		/**
   * Rolls back all transactions in parallel.
   * @returns {Promise.<*>}
   */

	}, {
		key: "rollbackAll",
		value: function rollbackAll() {
			var promises = [];
			forEachRight(this.transactionItems, function (item) {
				if (item.completed) {
					promises.push(item.rollback());
				}
			});
			return Promise.all(promises);
		}
	}, {
		key: "_log",
		value: function _log(message) {
			this.logger.log(this.transactionId + ": " + message);
		}
	}, {
		key: "_error",
		value: function _error(message) {
			this.logger.error(this.transactionId + ": " + message);
		}

		/**
   * Runs all transaction items in parallel.
   */

	}, {
		key: "runParallel",
		value: function runParallel() {
			var _this3 = this;

			return new Promise(function (resolve, reject) {
				_this3._log("Transaction executing.");
				var promises = [];
				forEach(_this3.transactionItems, function (item) {
					promises.push(item.exec());
				});
				Promise.all(promises).then(function () {
					_this3._log("Transaction execution succeeded.");
					resolve();
				}).catch(function (error) {
					_this3._error("Transaction failed. " + errorAsString(error));
					_this3.rollbackAll().then(function () {
						_this3._log("Transaction rolled back successfully.");
						reject(error);
					}).catch(function (error) {
						_this3._error("Transaction failed to roll back. " + errorAsString(error));
						reject(error);
					});
				});
			});
		}

		/**
   * Runs all transaction items in serial, chaining values from one call to the next
   */

	}, {
		key: "runSerial",
		value: function runSerial() {
			var _this4 = this;

			return new Promise(function (resolve, reject) {
				if (_this4.transactionItems.length > 0) {
					_this4._log("Transaction executing.");
					Promise.reduce(_this4.transactionItems, function (result, p) {
						return p.exec(result).then(function (newResult) {
							return newResult;
						});
					}, null).then(function (finalResult) {
						_this4._log("Transaction execution succeeded.");
						resolve(finalResult);
					}).catch(function (error) {
						_this4._log("Transaction failed. " + errorAsString(error));
						_this4.rollbackAll().then(function () {
							_this4._log("Transaction rolled back successfully.");
							reject(error);
						}).catch(function (error) {
							_this4._error("Transaction failed to roll back. " + errorAsString(error));
							reject(error);
						});
					});
				}
			});
		}
	}]);

	return Transaction;
}();

function errorAsString(error) {
	return error ? error.toString() : "";
}

exports.Transaction = Transaction;
exports.TransactionItem = TransactionItem;

//# sourceMappingURL=index.js.map