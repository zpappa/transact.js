[![Build Status](https://travis-ci.org/zpappa/transact.js.svg?branch=master)](https://travis-ci.org/zpappa/transact.js) [![codecov](https://codecov.io/gh/zpappa/transact.js/branch/master/graph/badge.svg)](https://codecov.io/gh/zpappa/transact.js)

# transact.js

## simple transaction management

A relatively simple transaction management library that seeks to provide an abstraction for working with promises in a transactional manner.

Each 'TransactionItem' is simply a promise to do something AND a promise to undo something. 

An ordered collection of such items is considered a 'Transaction'. A Transaction can be executed such that the associated TransactionItems are executed in parallel or in serial.

Use this as an abstraction for managing complex transactions that involve side effects outside of your immediate system.

### Usage:

npm install transact.js --save

###Basic example
```javascript
const Promise = require('bluebird');
const TransactionItem = require('transact.js').TransactionItem;
const Transaction = require('transact.js').Transaction;

let item = new TransactionItem( 
                               ()=>{ console.log("applying some change to some system"); 
                                     return Promise.resolve(); } 
                              ,()=>{ console.log("reversing some change to some system"); 
                                     return Promise.resolve(); } 
                              ) 
let trns = new Transaction(null, [item]); 
trns.runParallel().then(() => {...}); 
trns.runSerial().then(() => {...});
```

###Parallel promises example
This will run the given transaction items in parallel, executing rollbacks on all completed transaction items if any single transaction item fails to succeed.
```javascript
const Promise = require('bluebird');
const TransactionItem = require('transact.js').TransactionItem;
const Transaction = require('transact.js').Transaction;

let item1 = new TransactionItem( 
                               ()=>{ console.log("applying some change to some system"); 
                                     return Promise.resolve(); } 
                              ,()=>{ console.log("reversing some change to some system"); 
                                     return Promise.resolve(); } 
                              );
                               
let item2 = new TransactionItem( 
                              ()=>{ console.log("applying some change to some system"); 
                                    return Promise.resolve(); } 
                             ,()=>{ console.log("reversing some change to some system"); 
                                    return Promise.resolve(); } 
                             );
let trns = new Transaction(null, [item1, item2]); 
trns.runParallel().then(() => {...}); 
```

###Serial promises example
This will run the given transaction items in serial, executing rollbacks on all transaction items if any single transaction item fails to succeed.
```javascript
const Promise = require('bluebird');
const TransactionItem = require('transact.js').TransactionItem;
const Transaction = require('transact.js').Transaction;

let item1 = new TransactionItem( 
                               ()=>{ console.log("applying some change to some system"); 
                                     return Promise.resolve(); } 
                              ,()=>{ console.log("reversing some change to some system"); 
                                     return Promise.resolve(); } 
                              );
                               
let item2 = new TransactionItem( 
                              ()=>{ console.log("applying some change to some system"); 
                                    return Promise.resolve(); } 
                             ,()=>{ console.log("reversing some change to some system"); 
                                    return Promise.resolve(); } 
                             );
let trns = new Transaction(null, [item1, item2]); 
trns.runParallel().then(() => {...}); 
```