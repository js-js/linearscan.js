# Linearscan.js

Linearscan register allocator for javascript

## API

```javascript
// Declare some instructions
var linearscan = require('linearscan');

var config = linearscan.config.create({
  // List of available registers
  registers: [ 'rax', 'rbx', 'rcx', 'rdx' ],

  // Available opcodes
  opcodes: {
    literal: {
      // `any` means either `register` or `spill`
      output: 'any'
    },
    if: {},
    jump: {},
    'ssa:phi': {
      output: 'any',
      inputs: [ 'any', 'any' ]
    },
    add: {
      output: 'any',
      inputs: [ 'any', 'any' ]
    },
    return: {
      // Specify particular register requirement
      inputs: [ { kind: 'register', value: 'rax' } ]
    },
    'rax-out': {
      inputs: [],
      output: { kind: 'register', value: 'rax' },
      spills: []
    },
    'rbx-out': {
      inputs: [],
      output: { kind: 'register', value: 'rbx' },
      spills: []
    },
    'rbx-call': {
      inputs: [],
      output: { kind: 'register', value: 'rbx' },
      spills: [
        { kind: 'register', value: 'rax' },
        { kind: 'register', value: 'rbx' },
        { kind: 'register', value: 'rcx' },
        { kind: 'register', value: 'rdx' }
      ]
    },
    call: {
      output: { kind: 'register', value: 'rax' },
      // `register` means any kind of register
      inputs: [ 'register', 'any' ],
      spills: [
        { kind: 'register', value: 'rax' },
        { kind: 'register', value: 'rbx' },
        { kind: 'register', value: 'rcx' },
        { kind: 'register', value: 'rdx' }
      ]
    }
  }
});

// Get pipeline from previous stages of compiler
// (see json-pipeline npm module)
var pipeline = getPipeline();

// Make sure that pipeline is properly indexed
pipeline.reindex();

var out = linearscan.allocate(pipeline, config);
console.log(out.render('printable'));
```

Will output something like this:

```javascript
register {
  %rax = literal 1
  %rbx = literal 2
  %rcx = literal 3
  %rdx = literal 4
  [0] = ls:move %3
  %rdx = literal 5
  [1] = ls:move [0]
  [3] = ls:move %1
  [2] = ls:move %2
  [0] = ls:move %3
  %rax = call %rdx, %rax
  %rax = add [3], [3]
  %rax = add [2], [2]
  %rax = add [1], [1]
  %rax = add [0], [0]
}
```

## Spill count

`out.spills` is the number of used spill slots

#### LICENSE

This software is licensed under the MIT License.

Copyright Fedor Indutny, 2015.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
