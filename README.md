# transact.js

## simple transaction management

A relatively simple transaction management library that simply seeks to provide an abstraction for working with promises in a transactional manner.

*Do not use this for state management, use redux, flux, mobx, or alt, or some other state management library.*

Use this as an abstraction for managing complex transactions that involve side effects outside of your immediate system.

Note that Transaction.runSerial will reduce results together, allowing you to pass results forward from resolved step to resolved step.

### Usage:

npm install transact.js --save

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
let trns = new Transaction(null, item); 
trns.runParallel().then(() => {...}); 
trns.runSerial().then(() => {...});
```
