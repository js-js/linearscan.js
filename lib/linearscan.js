var assert = require('assert');

function Linearscan(options) {
  this.options = options;
  this.registers = options.registers;
  this.registersMap = {};
  this.declarations = {};
  this.intervals = {};
  this.intervalId = null;

  // Filled during .run() call
  this.blocks = null;
  this.instructions = null;

  this.init();
};
module.exports = Linearscan;

Linearscan.create = function create(options) {
  return new Linearscan(options);
};

Linearscan.prototype.init = function init() {
  // Fill declarations, applying default values
  this.declarations.to_phi = {
    inputs: [ { type: 'any' }, { type: 'any' } ],
    output: { type: 'any' },
    scratch: [],
    call: false
  };

  this.declarations.phi = {
    inputs: [],
    output: { type: 'any' },
    scratch: [],
    call: false
  };
  this.declarations.gap = {
    inputs: [],
    output: null,
    scratch: [],
    call: false
  };

  Object.keys(this.options.instructions).forEach(function(type) {
    var instr = this.options.instructions[type];

    this.declarations[type] = {
      output: instr.output !== null ? { type: 'any' } : instr.output,
      inputs: instr.inputs || [],
      scratch: instr.scratch || [],
      call: !!instr.call
    };
  }, this);

  // Create fixed intervals for all available registers
  this.intervalId = 0;
  this.registers = this.registers.map(function(reg) {
    var interval = this.createInterval(reg);
    interval.fix({ type: 'register', id: reg });
    this.registersMap[reg] = interval;

    return interval;
  }, this);
};

Linearscan.prototype.run = function run(input) {
  // Clone blocks
  this.blocks = this.clone(input);

  // Reorder blocks
  this.reorder();

  // Enumerate instructions in each block and insert gaps
  this.enumerate();

  // Find liveIn/liveOut for each block
  this.computeLiveness();

  // Allocate registers
  this.allocate();

  // Throw away all internal properties
  return this.strip();
};

Linearscan.prototype.clone = function clone(blocks) {
  var root = blocks[0].id;

  // Replace references to other blocks and instructions with
  // actual instructions
  var blockMap = {};
  var instructionMap = {};
  blocks = blocks.map(function(block) {
    var res = new Block(this, block, instructionMap);
    if (block.id)
      blockMap[block.id] = res;

    return res;
  }, this);

  // Replace uses
  blocks.forEach(function(block) {
    block.init(blockMap, instructionMap);
  });

  return blocks;
};

Linearscan.prototype.reorder = function reorder() {
  var blocks = this.blocks;
  var visited = {};
  var loopEnds = [];

  function blockCompare(a, b) {
    return a.loopIndex === b.Index ? 0 :
        b.loopDepth - a.loopDepth;
  }

  // BFS through blocks to find/mark loop starts
  var queue = [ blocks[0] ];
  while (queue.length > 0) {
    var block = queue.shift();

    // Normal block, visit successors
    visited[block.id] = true;
    for (var i = 0; i < block.successors.length; i++) {
      var succ = block.successors[i];
      if (visited[succ.id]) {
        succ.markLoop(block);
        succ.loopIndex = loopEnds.length;
        loopEnds.push({ start: succ, end: block });
        continue;
      }
      queue.push(succ);
    }
  }

  // Go upwards from loop end blocks, increasing block's loopDepth
  // XXX: O(n^2)
  loopEnds.forEach(function(item, i) {
    var start = item.start,
        end = item.end;

    var queue = [ end ];
    var visited = {};
    while (queue.length > 0) {
      var block = queue.shift();
      if (visited[block.id])
        continue;
      visited[block.id] = true;

      if (block.loopIndex === null) {
        // Separate loop
        block.loopIndex = start.loopIndex;
      } else {
        // Inner loop
        var outerSucc = block.loopEnd || block.successors[0];
        if (block.loopDepth === outerSucc.loopDepth)
          block.loopIndex = start.loopIndex;
      }
      block.loopDepth++;

      if (block === start)
        continue;

      // Visit predecessors
      for (var i = 0; i < block.predecessors.length; i++) {
        var pred = block.predecessors[i];
        queue.push(pred);
      }
    }
  });

  // Sort blocks by loop depth
  var queue = [ blocks[0] ];
  var result = [];
  while (queue.length > 0) {
    var block = queue.shift();

    result.push(block);

    for (var i = 0; i < block.successors.length; i++) {
      var succ = block.successors[i];

      // Not all predecessors was processed yet
      if (--succ.incomingForward !== 0)
        continue;

      // Do sorted insert
      // (Try to go deeper, or stay in the same loop)
      binaryInsert(queue, succ, blockCompare);
    }
  }

  this.blocks = result;
};

Linearscan.prototype.enumerate = function enumerate() {
  var blocks = this.blocks;
  var pos = 0;

  this.instructions = {};

  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    var start = pos;

    // Start block with a gap
    var gap = new Instruction(this, block, { type: 'gap' });
    gap.pos = pos++;
    this.instructions[gap.pos] = gap;
    var instructions = [ gap ];
    for (var j = 0; j < block.instructions.length; j++) {
      var instr = block.instructions[j];

      instr.pos = pos++;
      this.instructions[instr.pos] = instr;
      instructions.push(instr);

      var gap = new Instruction(this, block, { type: 'gap' });
      gap.pos = pos++;
      this.instructions[gap.pos] = gap;
      instructions.push(gap);
    }
    block.instructions = instructions;

    block.start = start;
    block.end = pos;
  }
};

Linearscan.prototype.computeLiveness = function computeLiveness() {
  // Compute liveGen/liveKill
  this.buildLocal();

  // Compute liveIn/liveOut
  this.buildGlobal();
};

Linearscan.prototype.buildLocal = function buildLocal() {
  var blocks = this.blocks;

  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];

    for (var j = 0; j < block.instructions.length; j++) {
      var instr = block.instructions[j];
      var decl = instr.decl;

      // Output to live kill
      if (instr.phi !== null)
        block.liveKill[instr.phi.output.id] = true;
      if (decl.output !== null)
        block.liveKill[instr.output.id] = true;

      // Inputs to live gen
      decl.inputs.forEach(function(declInput, i) {
        var input = instr.inputs[i];
        if (input instanceof Instruction && !block.liveKill[input.output.id])
          block.liveGen[input.output.id] = true;
      });
    }
  }
};

Linearscan.prototype.buildGlobal = function buildGlobal() {
  var blocks = this.blocks;

  do {
    var change = false;

    for (var i = blocks.length - 1; i >= 0; i--) {
      var block = blocks[i];
      var prevOut = Object.keys(block.liveOut).length;
      var prevIn = Object.keys(block.liveIn).length;

      // Propagate successors' inputs to block outputs
      var newOut = 0;
      block.liveOut = {};
      for (var j = 0; j < block.successors.length; j++) {
        var succ = block.successors[j];
        var succKeys = Object.keys(succ.liveIn);

        succKeys.forEach(function(id) {
          if (!block.liveOut[id]) {
            block.liveOut[id] = true;
            newOut ++;
          }
        });
      }

      // All outputs that are not killed in this block should be
      // propagated to the inputs
      var newIn = 0;
      block.liveIn = {};
      Object.keys(block.liveOut).forEach(function(id) {
        if (!block.liveKill[id]) {
          block.liveIn[id] = true;
          newIn++;
        }
      });
      Object.keys(block.liveGen).forEach(function(id) {
        if (!block.liveIn[id]) {
          block.liveIn[id] = true;
          newIn++;
        }
      });

      if (prevOut !== newOut || prevIn !== newIn)
        change = true;
    }
  } while(change);
};

Linearscan.prototype.buildIntervals = function buildIntervals() {
  var blocks = this.blocks;

  for (var i = blocks.length - 1; i >= 0; i--) {
    var block = blocks[i];

    Object.keys(block.liveOut).forEach(function(id) {
      var interval = this.intervals[id];

      interval.addRange(block.start, block.end);
    }, this);

    for (var j = block.instructions.length - 1; j >= 0; j--) {
      var instr = block.instructions[j];
      var decl = instr.decl;

      // Add fixed [pos, pos + 1] range
      // TODO(indutny): make affected registers extensible
      if (decl.call) {
        this.registers.forEach(function(interval) {
          interval.addRange(instr.pos, instr.pos + 1);
        });
      }

      if (instr.output !== null) {
        instr.output.shortenRange(instr.pos);
        instr.output.addUse(instr, decl.output);
      }

      instr.scratch.forEach(function(scratch, i) {
        scratch.addRange(instr.pos, instr.pos + 1);
        scratch.addUse(instr, decl.scratch[i]);
      });

      instr.inputs.forEach(function(input, i) {
        if (input instanceof Instruction) {
          input.output.addRange(block.start, instr.pos);
          input.output.addUse(instr, decl.inputs[i]);
        }
      });
    }
  }
};

Linearscan.prototype.allocate = function allocate() {
  this.buildIntervals();
};

Linearscan.prototype.strip = function strip() {
  return null;
};

Linearscan.prototype.toJSON = function toJSON() {
  var intervals = [];
  var instructions = [];

  var blocks = this.blocks.map(function(block) {
    return block.toJSON();
  });

  Object.keys(this.intervals).forEach(function(id) {
    intervals[id] = this.intervals[id].toJSON();
  }, this);

  Object.keys(this.instructions).forEach(function(pos) {
    instructions[pos] = this.instructions[pos].toJSON();
  }, this);

  return {
    intervals: intervals,
    blocks: blocks,
    instructions: instructions
  };
};

Linearscan.prototype.createInterval = function createInterval() {
  var id = this.intervalId++;
  var interval = new Interval(id);

  this.intervals[id] = interval;

  return interval;
};

//
// Various entities
//

function Block(ls, block, instructions) {
  this.id = block.id;
  this.instructions = block.instructions.map(function(instr) {
    var res = new Instruction(ls, this, instr);
    if (res.id)
      instructions[res.id] = res;
    return res;
  }, this);

  this.successors = block.successors || [];
  this.predecessors = [];

  // Needed for reordering
  this.incomingForward = 0;

  this.loopStart = false;
  this.loopEnd = null;
  this.loopDepth = 0;
  this.loopIndex = null;

  // Enumeration
  this.start = null;
  this.end = null;

  // Interval construction
  // TODO(indutny): use bitmaps, perhaps?
  this.liveGen = {};
  this.liveKill = {};
  this.liveIn = {};
  this.liveOut = {};
}

Block.prototype.init = function init(blocks, instructions) {
  this.successors = this.successors.map(function(id) {
    var res = blocks[id];
    res.predecessors.push(this);
    res.incomingForward++;
    return res;
  }, this);

  this.instructions.forEach(function(instr) {
    instr.init(instructions);
  });
};

Block.prototype.toJSON = function toJSON() {
  return {
    id: this.id,
    start: this.start,
    end: this.end,
    loop_depth: this.loopDepth,
    successors: this.successors.map(function(succ) {
      return succ.id;
    })
  };
};

Block.prototype.markLoop = function markLoop(end) {
  this.loopStart = true;
  this.loopEnd = end;
  this.incomingForward--;
  assert.equal(this.predecessors.length, 2);
};

function Instruction(ls, block, instr) {
  this.id = instr.id || null;
  this.type = instr.type;
  this.decl = ls.declarations[this.type];
  this.block = block;

  this.inputs = instr.inputs ? instr.inputs.slice() : [];
  this.output = this.decl.output === null ? null : ls.createInterval();
  this.scratch = this.decl.scratch.map(function(scratch) {
    return ls.createInterval().fix(scratch);
  });
  this.pos = null;
  this.initialized = false;

  // Used only for `to_phi` type
  this.phi = null;
}

Instruction.prototype.init = function init(instructions) {
  this.initialized = true;

  if (this.type === 'to_phi') {
    var phi = this.inputs.pop();
    phi = instructions[phi.id];

    // to_phi has a phi as it's output
    this.output = phi.output;
    this.phi = phi;
  }

  this.inputs = this.inputs.map(function(input) {
    if (!input || input.type !== 'instruction')
      return input;

    var res = instructions[input.id];
    if (!res.initialized)
      res.init(instructions);
    return res;
  }, this);
};

Instruction.prototype.toJSON = function toJSON() {
  var inputs = this.inputs;

  if (this.phi !== null)
    inputs = inputs.concat(this.phi);

  inputs = inputs.map(function(input) {
    if (input instanceof Instruction)
      return { type: 'instruction', id: input.pos };
    else
      return input;
  });

  return {
    id: this.pos,
    block: this.block.id,
    kind: this.type,
    inputs: inputs,
    temporary: this.scratch.map(function(interval) {
      return { type: 'interval', id: interval.id };
    }),
    output: this.output === null ? null : this.output.id
  };
};

function Interval(id) {
  this.id = id;
  this.parent = null;
  this.children = [];
  this.fixed = false;
  this.value = null;
  this.uses = [];
  this.ranges = [];
}

Interval.prototype.fix = function fix(value) {
  this.fixed = true;
  this.value = value;
};

function useSort(a, b) {
  return a.instr.pos - b.instr.pos;
}

Interval.prototype.addUse = function addUse(instr, kind) {
  binaryInsert(this.uses, { instr: instr, kind: kind }, useSort);
};

function rangeSort(a, b) {
  return a.start - b.start;
}

Interval.prototype.addRange = function addRange(start, end) {
  if (this.ranges.length === 0 || this.ranges[0].start !== end)
    binaryInsert(this.ranges, { start: start, end: end }, rangeSort);
  else
    this.ranges[0].start = start;
};

Interval.prototype.shortenRange = function shortenRange(start) {
  if (this.ranges.length === 0)
    this.addRange(start, start + 1);
  else
    this.ranges[0].start = start;
};

Interval.prototype.toJSON = function toJSON() {
  return {
    id: this.id,
    parent: this.parent && this.parent.id,
    children: this.children.map(function(child) {
      return child.id;
    }),
    ranges: this.ranges,
    uses: this.uses.map(function(use) {
      return {
        pos: use.instr.pos,
        kind: use.kind
      };
    }),
    value: this.value
  };
};

function binaryInsert(list, item, compare) {
  var start = 0,
      end = list.length;

  while (start < end) {
    var pos = (start + end) >> 1;
    var cmp = compare(item, list[pos]);

    if (cmp === 0) {
      start = pos;
      end = pos;
      break;
    } else if (cmp < 0) {
      end = pos;
    } else {
      start = pos + 1;
    }
  }

  list.splice(start, 0, item);
}
