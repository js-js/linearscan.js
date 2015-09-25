# Linearscan.js

Linearscan register allocator for javascript

## API

```javascript
// Declare some instructions
var linearscan = require('linearscan');

function gp(kind, value) {
  return { kind: kind, group: 'gp', value: value };
}

function fp(kind, value) {
  return { kind: kind, group: 'fp', value: value };
}

var config = linearscan.config.create({
  // Multiple register groups might be specified, they will be allocated
  // separately
  registers: {
    gp: [
      'rax', 'rbx', 'rcx', 'rdx'
    ],
    fp: [
      'xmm1', 'xmm2', 'xmm3', 'xmm4'
    ]
  },
  opcodes: {
    literal: {
      // 'any' means either 'register' or 'spill'
      output: gp('any')
    },
    'literal-fp': {
      output: fp('any')
    },
    if: {},
    jump: {},
    add: {
      output: gp('any'),
      inputs: [ gp('any'), gp('any') ]
    },
    'add-fp': {
      output: fp('any'),
      inputs: [ fp('any'), fp('any') ]
    },
    floor: {
      output: gp('any'),
      inputs: [ fp('any') ]
    },
    return: {
      // specify particular register that MUST be used here
      inputs: [ gp('register', 'rax') ]
    },
    'rax-out': {
      inputs: [],
      output: gp('register', 'rax'),
      spills: []
    },
    'rbx-out': {
      inputs: [],
      output: gp('register', 'rbx'),
      spills: []
    },
    'rbx-call': {
      inputs: [],
      output: gp('register', 'rbx'),
      spills: [
        gp('register', 'rax'),
        gp('register', 'rbx'),
        gp('register', 'rcx'),
        gp('register', 'rdx')
      ]
    },
    call: {
      output: gp('register', 'rax'),

      // 'register' means just any GP register
      inputs: [ gp('register'), gp('any') ],

      // Spills will be moved to stack slots on invocation of this opcode
      spills: [
        gp('register', 'rax'),
        gp('register', 'rbx'),
        gp('register', 'rcx'),
        gp('register', 'rdx')
      ]
    },
    'dyn-param': {
      // You may pass function to make decision depend on the node
      output: function(node) {
        return gp('register', [ 'rax', 'rbx', 'rcx', 'rdx' ][node.literals[0]]);
      }
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

`out.spillType` is the list of spill ranges of following format:
`{ type: 'register-group', from: index, to: index }`.

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
