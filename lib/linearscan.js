var assert = require('assert');

function Linearscan(options) {
  this.options = options;
  this.registers = options.registers;
  this.instructions = {};

  this.instructions.to_phi = {
    ret: null,
    args: [ { type: 'any' }, { type: 'any' } ]
  };

  this.phi = {
    ret: null,
    args: []
  };

  // Fill instructions, applying default values
  Object.keys(options.instructions).forEach(function(type) {
    var instr = options.instructions[type];

    this.instructions[type] = {
      ret: instr.ret !== null ? { type: 'any' } : instr.ret,
      args: instr.args || []
    };
  }, this);
};
module.exports = Linearscan;

Linearscan.create = function create(options) {
  return new Linearscan(options);
};

Linearscan.prototype.run = function run(input) {
  // Clone blocks
  var blocks = this.clone(input);

  // Reorder blocks
  blocks = this.reorder(blocks);

  // Enumerate instructions in each block and insert gaps
  this.enumerate(blocks);

  // Find liveIn/liveOut for each block
  this.computeLiveness(blocks);

  // Allocate registers
  this.allocate(blocks);

  // Throw away all internal properties
  return this.strip(blocks);
};

Linearscan.prototype.clone = function clone(blocks) {
  var root = blocks[0].id;

  // Replace references to other blocks and instructions with
  // actual instructions
  var blockMap = {};
  var instructionMap = {};
  blocks = blocks.map(function(block) {
    var res = new Block(block, instructionMap);
    if (block.id)
      blockMap[block.id] = res;

    return res;
  });

  // Replace uses
  blocks.forEach(function(block) {
    block.init(blockMap, instructionMap);
  });

  return blocks;
};

Linearscan.prototype.reorder = function reorder(blocks) {
  var visited = {};
  var loopEnds = [];

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
      binaryInsert(queue, succ, function compare(a, b) {
        return a.loopIndex === b.Index ? 0 :
            b.loopDepth - a.loopDepth;
      });
    }
  }

  return result;
};

Linearscan.prototype.enumerate = function enumerate(blocks) {
  var pos = 0;

  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    var start = pos;

    // Start block with a gap
    var gap = new Instruction({ type: 'gap' });
    gap.pos = pos++;
    var instructions = [ gap ];
    for (var j = 0; j < block.instructions.length; j++) {
      var instr = block.instructions[j];

      instr.pos = pos++;
      instructions.push(instr);
      var gap = new Instruction({ type: 'gap' });
      gap.pos = pos++;
      instructions.push(gap);
    }
    block.instructions = instructions;

    block.start = start;
    block.end = pos - 1;
  }
};

Linearscan.prototype.computeLiveness = function computeLiveness(blocks) {
  // Compute liveGen/liveKill
  this.buildLocal(blocks);

  // Compute liveIn/liveOut
  this.buildGlobal(blocks);
};

Linearscan.prototype.buildLocal = function buildLocal(blocks) {
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];

    for (var j = 0; j < block.instructions.length; j++) {
      var instr = block.instructions[j];
      var decl = this.instructions[instr.type];
      if (!decl)
        continue;

      // Output to live kill
      if (instr.phi !== null)
        block.liveKill[instr.phi.pos] = true;
      if (decl.ret !== null)
        block.liveKill[instr.pos] = true;

      // Inputs to live gen
      decl.args.forEach(function(declArg, i) {
        var arg = instr.args[i];
        if (arg instanceof Instruction && !block.liveKill[arg.pos])
          block.liveGen[arg.pos] = true;
      });
    }
  }
};

Linearscan.prototype.buildGlobal = function buildGlobal(blocks) {
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

        succKeys.forEach(function(pos) {
          if (!block.liveOut[pos]) {
            block.liveOut[pos] = true;
            newOut ++;
          }
        });
      }

      // All outputs that are not killed in this block should be
      // propagated to the inputs
      var newIn = 0;
      block.liveIn = {};
      Object.keys(block.liveOut).forEach(function(pos) {
        if (!block.liveKill[pos]) {
          block.liveIn[pos] = true;
          newIn++;
        }
      });
      Object.keys(block.liveGen).forEach(function(pos) {
        if (!block.liveIn[pos]) {
          block.liveIn[pos] = true;
          newIn++;
        }
      });

      if (prevOut !== newOut || prevIn !== newIn)
        change = true;
    }
  } while(change);
};

Linearscan.prototype.allocate = function allocate(blocks) {
  var intervals = this.buildIntervals(blocks);
};

Linearscan.prototype.buildIntervals = function buildIntervals(blocks) {
};

Linearscan.prototype.strip = function strip(blocks) {
  return blocks.map(function(block) {
    return block.toJSON();
  });
};

//
// Various entities
//

function Block(block, instructions) {
  this.id = block.id;
  this.instructions = block.instructions.map(function(instr) {
    var res = new Instruction(instr);
    if (res.id)
      instructions[res.id] = res;
    return res;
  });

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
    instructions: this.instructions.map(function(instr) {
      return instr.toJSON()
    }),
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

function Instruction(instr) {
  this.id = instr.id || null;
  this.type = instr.type;
  this.uses = [];
  this.args = instr.args ? instr.args.slice() : [];
  this.pos = null;

  this.interval = new Interval();

  // Used only for `to_phi` type
  this.phi = null;
}

Instruction.prototype.init = function init(instructions) {
  if (!this.args)
    this.args = [];

  this.args = this.args.map(function(arg) {
    if (!arg || arg.type !== 'instruction')
      return arg;

    var res = instructions[arg.id];
    res.addUse(this);
    return res;
  }, this);

  if (this.type === 'to_phi') {
    var phi = this.args.pop();

    // to_phi has a phi as it's output
    this.interval = phi.interval;
    this.phi = phi;
  }
};

Instruction.prototype.toJSON = function toJSON() {
  var args = this.args;

  if (this.phi !== null)
    args = args.concat(this.phi);

  args = args.map(function(arg) {
    if (arg instanceof Instruction)
      return { type: 'instruction', id: arg.id, pos: arg.pos };
    else
      return arg;
  });

  return {
    id: this.id,
    pos: this.pos,
    type: this.type,
    args: args
  };
};

Instruction.prototype.addUse = function addUse(instr) {
  this.uses.push(instr);
};

function Interval() {
}

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
      end = pos - 1;
    } else {
      start = pos + 1;
    }
  }

  list.splice(start, 0, item);
}
