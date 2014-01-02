# Linearscan.js

Linearscan register allocator for javascript

## API

```javascript
// Declare some instructions
var ls = require('linearscan').create({
  // All possible registers
  registers: [ 'rax', 'rbx', 'rcx', 'rdx' ],

  // All instructions
  instructions: {
    // With this declaration it will be possible to pass
    // javascript value as an input of `literal` instruction,
    // skipping the register allocation for it, but preserving it
    // in the result JSON
    literal: { inputs: [ { type: 'js' } ] },

    // Normally, you should specify output/inputs types, which could be:
    // * `{ type: 'any' }` - either register or memory slot
    // * `{ type: 'register' }` - any register
    // * `{ type: 'register', id: '<register name>' }` - specific register
    add: {
      output: { type: 'any' },
      inputs: [ { type: 'register' }, { type: 'register' } ]
    },

    // Instruction with no output
    ret: {
      output: null,
      inputs: [ { type: 'register', id: 'rax' } ]
    },

    branch: {
      output: null,
      inputs: [ { type: 'register' }, { type: 'register' } ]
    }
  }
});

// Pass CFG blocks as an input of the register allocator
var out = ls.run([
  {
    id: 'B1', // Block id
    successors: [ 'B2' ], // Id of successors blocks (optional, 2 maximum)

    // Instructions
    instructions: [
      {
        id: 'one', // Id of instruction, must be unique
        type: 'literal',
        inputs: [ { type: 'js', value: 42 } ]
      },
      {
        id: 'sum',
        type: 'add',
        inputs: [
          // Use other instruction as an input
          { type: 'instruction', id: 'one' },
          { type: 'instruction', id: 'one' }
        ]
      }
    ]
  }, {
    id: 'B2',
    instructions: [
      { type: 'ret', inputs: [ { type: 'instruction', id: 'sum' } ] }
    ]
  }
]);

console.log(require('util').inspect(out, false, 300));
```

Will output:

```json
[ { id: 'B1',
    instructions:
     [ { id: 'one',
         type: 'literal',
         inputs: [ { type: 'js', value: 42 } ],
         moves: null,
         temporary: [],
         output: { type: 'register', id: 'rax' } },
       { id: 'sum',
         type: 'add',
         inputs:
          [ { type: 'register', id: 'rax' },
            { type: 'register', id: 'rax' } ],
         moves: null,
         temporary: [],
         output: { type: 'register', id: 'rax' } } ],
    successors: [ 'B2' ] },
  { id: 'B2',
    instructions:
     [ { id: null,
         type: 'ret',
         inputs: [ { type: 'register', id: 'rax' } ],
         moves: null,
         temporary: [],
         output: null } ],
    successors: [] } ]
```

## Intermediate Language

You may also find it more comfortable to use custom IL for writing blocks with
instructions:

```javascript
var out = ls.run(linearscan.parse(
    'block B1 -> B2\n' +
    '  one = literal %42\n' + // `%42` means js value `42`
    '  sum = add one, one\n' +
    'block B2\n' +
    '  ret sum'
));
```

## Phis and ToPhis

There're a couple of intrinsic instructions with a special meaning, one of them
are: `phi` and `to_phi`. The best way to describe how it works would an IL
example:

```IL
block B1 -> B2, B3
  a = literal %0
  b = literal %1
  branch a, b
block B2
  to_phi a, out
block B3
  to_phi b, out
block B4
  out = phi
  ret out
```

Basically, since IR and IL is in [SSA][0] form, variables that have their value
depend on the branching or loop iterations, should be assigned to the final
value using `to_phi` instruction: first argument - intermediate value, second -
final phi value, that must be declared with `<id> = phi` in a successor block.

## Gap

The IL code above will generate following JSON output:

```json
[ { id: 'B1',
    instructions:
     [ { id: 'a',
         type: 'literal',
         inputs: [ { type: 'js', value: 0 } ],
         moves: null,
         temporary: [],
         output: { type: 'register', id: 'rax' } },
       { id: 'b',
         type: 'literal',
         inputs: [ { type: 'js', value: 1 } ],
         moves: null,
         temporary: [],
         output: { type: 'register', id: 'rbx' } },
       { id: null,
         type: 'branch',
         inputs:
          [ { type: 'register', id: 'rax' },
            { type: 'register', id: 'rbx' } ],
         moves: null,
         temporary: [],
         output: null } ],
    successors: [ 'B2', 'B3' ] },
  { id: 'B3',
    instructions:
     [ { id: null,
         type: 'gap',
         inputs: [],
         moves:
          [ { type: 'move',
              from: { type: 'register', id: 'rbx' },
              to: { type: 'register', id: 'rax' } } ],
         temporary: [],
         output: null } ],
    successors: [ 'B4' ] },
  { id: 'B2', instructions: [], successors: [ 'B4' ] },
  { id: 'B4',
    instructions:
     [ { id: null,
         type: 'ret',
         inputs: [ { type: 'register', id: 'rax' } ],
         moves: null,
         temporary: [],
         output: null } ],
    successors: [] } ]
```

You could notice that `gap` instruction has appeared in output, but wasn't
present in the input. It is an another intrinsic instruction.

Basically, it contains all moves between registers/stack slots that must happen
at the time when gap instruction is reached. Note that `moves` may have two
types: `move` and `swap`. In case of `move` the value should be simply moved
from one location to another, and in case of `swap` values should be swapped
between each other.

## Spill count

You may get number of stack slots that will be used in resulting code by
calling this after `ls.run()`:

```javascript
ls.spillCount()
```

#### LICENSE

This software is licensed under the MIT License.

Copyright Fedor Indutny, 2014.

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

[0]: http://en.wikipedia.org/wiki/Static_single_assignment_form
