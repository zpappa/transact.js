"use strict";

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Promise = require("bluebird");
var TimeoutError = Promise.TimeoutError;
var forEach = require("lodash.foreach");
var forEachRight = require("lodash.foreachright");
var isFunction = require("lodash.isfunction");
var sortBy = require("lodash.sortby");

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
  * @param name
  * @param timeout - the time to wait on a rollback for the transaction to finish
  */
	function TransactionItem(forward, reverse, state, name, timeout) {
		_classCallCheck(this, TransactionItem);

		if (!(isFunction(forward) && isFunction(reverse))) {
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

	_createClass(TransactionItem, [{
		key: "_start",
		value: function _start() {
			var _this = this;

			this._completed = [];
			this.completed = new Promise(function (resolve, reject) {
				_this._completed.push({ resolve: resolve, reject: reject });
			});

			this.complete = function () {
				_this._completed[0].resolve(true);
			};

			this.incomplete = function () {
				_this._completed[0].resolve(false);
			};
		}
		/**
   * Executes the transaction
   * @param s - the state to utilize with the transaction, can be an object containing something the function may need but wasn't known ahead of time.
   */

	}, {
		key: "exec",
		value: function exec(s) {
			var _this2 = this;

			return new Promise(function (resolve, reject) {
				if (_this2.completed === false && !_this2.inRollback) {
					_this2._start();
					_this2.state = s ? s : _this2.state;
					_this2.forward(_this2.state).then(function (newState) {
						_this2.state = newState;
						_this2.complete();
						resolve(_this2.state);
					}).catch(function (error) {
						_this2.error = error;
						_this2.incomplete();
						reject(_this2._addName("The transaction item failed to execute. " + errorAsString(error)));
					});
				} else {
					reject(_this2._addName("This is an executed transaction item and cannot be re-executed"));
				}
			});
		}
	}, {
		key: "rollback",
		value: function rollback() {
			var _this3 = this;

			if (this.completed == false && !this.completed instanceof Promise) {
				this.inRollback = true;
				return Promise.resolve();
			} else {
				// this is either pending or resolved
				return new Promise(function (resolve, reject) {
					var timeout = _this3.timeout ? _this3.timeout : 1000;
					_this3.completed.timeout(timeout).then(function (completed) {
						if (completed) {
							_this3.reverse(_this3.state).then(function () {
								_this3.completed = false;
								resolve();
							}).catch(function (error) {
								reject(_this3._addName("The transaction item failed to rollback. " + errorAsString(error)));
							});
						} else {
							resolve();
						}
					}).catch(function (error) {
						if (error instanceof TimeoutError) {
							reject("The transaction item timed out");
						} else {
							reject(_this3._addName("The transaction item failed to execute. " + errorAsString(error)));
						}
					});
				});
			}
		}
	}, {
		key: "_addName",
		value: function _addName(errorStr) {
			return this.name ? this.name + ": " + errorStr : errorStr;
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
  * @param transactionItems
  * @param logger
  */
	function Transaction(transactionId, transactionItems, logger) {
		_classCallCheck(this, Transaction);

		this.transactionItems = [];
		if (transactionItems && transactionItems.length) {
			for (var i = 0; i < transactionItems.length; i++) {
				this.add(transactionItems[i]);
			}
			this.reorderItems();
		}

		this.transactionId = transactionId ? transactionId : new Date().getTime() / 1000;
		this.logger = logger ? logger : console;
	}

	/**can you
  * Adds a transaction item to the ordered list.
  * @param transactionItem
  */


	_createClass(Transaction, [{
		key: "add",
		value: function add(transactionItem) {
			if (transactionItem instanceof TransactionItem) {
				transactionItem.order = transactionItem.order ? transactionItem.order : this.transactionItems.length;
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
			var self = this;
			forEachRight(self.transactionItems, function (item) {
				if (!(self.completed === false && !self.completed instanceof Promise)) {
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
   * @param s - the state to utilize with ALL the transaction items, passed to ALL TransactionItem.exec() as the first argument.
   */

	}, {
		key: "runParallel",
		value: function runParallel(s) {
			var _this4 = this;

			return new Promise(function (resolve, reject) {
				_this4._log("Transaction executing.");
				var promises = [];
				forEach(_this4.transactionItems, function (item) {
					promises.push(item.exec(s));
				});
				Promise.all(promises).then(function () {
					_this4._log("Transaction execution succeeded.");
					resolve();
				}).catch(function (error) {
					// now have to go through all non-pending promises and imme
					_this4._error("Transaction failed. " + errorAsString(error));
					_this4.rollbackAll().then(function () {
						_this4._log("Transaction rolled back successfully.");
						reject(error);
					}).catch(function (error) {
						_this4._error("Transaction failed to roll back. " + errorAsString(error));
						reject(error);
					});
				});
			});
		}

		/**
   * Runs all transaction items in serial, chaining values from one call to the next
   * @param s - the state to utilize for the INITIAL transaction item, passed to the INITIAL TransactionItem.exec() as the first argument.
   */

	}, {
		key: "runSerial",
		value: function runSerial(s) {
			var _this5 = this;

			return new Promise(function (resolve, reject) {
				if (_this5.transactionItems.length > 0) {
					_this5._log("Transaction executing.");
					Promise.reduce(_this5.transactionItems, function (result, p) {
						result = p.order == 0 ? s : result;
						return p.exec(result).then(function (newResult) {
							return newResult;
						});
					}, null).then(function (finalResult) {
						_this5._log("Transaction execution succeeded.");
						resolve(finalResult);
					}).catch(function (error) {
						_this5._log("Transaction failed. " + errorAsString(error));
						_this5.rollbackAll().then(function () {
							_this5._log("Transaction rolled back successfully.");
							reject(error);
						}).catch(function (error) {
							_this5._error("Transaction failed to roll back. " + errorAsString(error));
							reject(error);
						});
					});
				}
			});
		}

		/**
   * Produces a JSON string of the object
   * @returns {String}
   */

	}, {
		key: "serialize",
		value: function serialize() {
			return JSON.stringify(this, null, 4);
		}

		/**
   * Produces a new Transaction from a JSON string
   * @param json
   * @returns {Transaction}
   */

	}, {
		key: "reorderItems",


		/**
   * called by deserialize and on constructor
   */
		value: function reorderItems() {
			return sortBy(this.transactionItems, function (ti) {
				return ti.order;
			});
		}
	}], [{
		key: "deserialize",
		value: function deserialize(json) {
			var objectData = JSON.parse(json);
			var transaction = new Transaction();
			Object.assign(transaction, objectData);
			transaction.reorderItems();
			return transaction;
		}
	}]);

	return Transaction;
}();

function errorAsString(error) {
	return error ? (typeof error === "undefined" ? "undefined" : _typeof(error)) === 'object' ? JSON.stringify(error, null, 4) : error : error;
}

exports.Transaction = Transaction;
exports.TransactionItem = TransactionItem;

//# sourceMappingURL=index.js.map