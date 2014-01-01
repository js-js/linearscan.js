var assert = require('assert');

function Linearscan(options) {
  this.options = options;
  this.registers = options.registers;
  this.registerList = null;
  this.registerMap = {};
  this.declarations = {};
  this.intervals = {};
  this.intervalId = null;

  // Filled during .run() call
  this.blocks = null;
  this.instructions = null;
  this.active = null;
  this.inactive = null;
  this.activeSpills = null;
  this.inactiveSpills = null;
  this.spills = null;
  this.maxSpill = null;

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
  this.registerList = this.registers.map(function(reg) {
    var interval = this.createInterval(reg);
    interval.fix({ type: 'register', id: reg });
    this.registerMap[reg] = interval;

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
      // TODO(indutny): make affected registers list extensible
      if (decl.call) {
        this.registerList.forEach(function(interval) {
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
        if (input instanceof Instruction && !input.output.covers(instr.pos)) {
          input.output.addRange(block.start, instr.pos);
          input.output.addUse(instr, decl.inputs[i]);
        }
      });
    }
  }
};

function unhandledSort(a, b) {
  return a.start() - b.start();
}

Linearscan.prototype.walkIntervals = function walkIntervals() {
  var self = this;

  this.active = [];
  this.inactive = [];
  this.activeSpills = [];
  this.inactiveSpills = [];

  this.unhandled = Object.keys(this.intervals).map(function(id) {
    return this.intervals[id];
  }, this).filter(function(interval) {
    if (interval.ranges.length === 0)
      return false;

    if (interval.fixed) {
      this.active.push(interval);
      return false;
    }

    return true;
  }, this).sort(unhandledSort);

  function sortOut(active, inactive, position, free) {
    // Move active => inactive, handled
    for (var i = active.length - 1; i >= 0; i--) {
      var item = active[i];
      if (item.end() <= position) {
        active.splice(i, 1);
        free(item);
      } else if (!item.covers(position)) {
        active.splice(i, 1);
        inactive.push(item);
      }
    }

    // Move inactive => active, handled
    for (var i = inactive.length - 1; i >= 0; i--) {
      var item = inactive[i];
      if (item.end() <= position) {
        inactive.splice(i, 1);
        free(item);
      } else if (item.covers(position)) {
        inactive.splice(i, 1);
        active.push(item);
      }
    }
  }

  function freeReg() {
    // No-op
  }

  function freeSpill(spill) {
    self.freeSpill(spill);
  }

  while (this.unhandled.length !== 0) {
    var current = this.unhandled.shift();
    var position = current.start();

    sortOut(this.active, this.inactive, position, freeReg);
    sortOut(this.activeSpills, this.inactiveSpills, position, freeSpill);

    // Allocate register
    if (!this.allocateFree(current))
      this.allocateBlocked(current);

    // Push registers to active
    if (current.value.type === 'register')
      this.active.push(current);
  }
};

Linearscan.prototype.allocateFree = function allocateFree(current) {
  var freePos = {};
  for (var i = 0; i < this.registers.length; i++)
    freePos[this.registers[i]] = Infinity;

  for (var i = 0; i < this.active.length; i++)
    freePos[this.active[i].value.id] = 0;

  for (var i = 0; i < this.inactive.length; i++) {
    var inactive = this.inactive[i];
    var pos = inactive.nextIntersection(current);
    if (pos === null)
      continue;
    freePos[inactive.value.id] = Math.min(freePos[inactive.value.id], pos);
  }

  var maxPos = 0;
  var id = null;
  for (var i = 0; i < this.registers.length; i++) {
    var reg = this.registers[i];
    if (freePos[reg] <= maxPos)
      continue;
    maxPos = freePos[reg];
    id = reg;
  }

  // Allocation failed :(
  if (maxPos <= current.start())
    return false;

  // Split required
  if (maxPos < current.end())
    this.splitBetween(current, current.start(), maxPos);

  current.value = { type: 'register', id: id };
  return true;
};

Linearscan.prototype.allocateBlocked = function allocateBlocked(current) {
  var usePos = {};
  var blockPos = {};
  for (var i = 0; i < this.registers.length; i++) {
    usePos[this.registers[i]] = Infinity;
    blockPos[this.registers[i]] = Infinity;
  }

  for (var i = 0; i < this.active.length; i++) {
    var active = this.active[i];
    if (active.fixed) {
      blockPos[active.value.id] = 0;
    } else {
      usePos[active.value.id] = active.firstUse('register', current.start());
    }
  }

  for (var i = 0; i < this.inactive.length; i++) {
    var inactive = this.inactive[i];
    var pos = inactive.nextIntersection(current);
    if (pos === null)
      continue;

    if (inactive.fixed) {
      blockPos[inactive.value.id] = pos;
    } else {
      pos = inVactive.firstUse('register', current.start());
      usePos[inactive.value.id] = Math.min(usePos[inactive.value.id], pos);
    }
  }

  var maxPos = 0;
  var id = null;
  for (var i = 0; i < this.registers.length; i++) {
    var reg = this.registers[i];
    if (usePos[reg] <= maxPos)
      continue;
    maxPos = usePos[reg];
    id = reg;
  }

  var firstUse = current.firstUse('register', 0);
  firstUse = firstUse === null ? null : firstUse.instr.pos;
  if (firstUse === null || maxPos < firstUse) {
    // Spill current, all others have register uses before this one
    current.value = this.getSpill();
    this.activeSpills.push(current);
    if (firstUse !== null)
      this.splitBetween(current, current.start(), firstUse);
  } else {
    current.value = { type: 'register', id: id };
    if (blockPos[id] < current.end())
      this.splitBetween(current, current.start(), blockPos[id]);
    this.splitAndSpill(current);
  }

  current.value = { type: 'stack', index: 0 };
};

Linearscan.prototype.getSpill = function getSpill() {
  var spill;

  if (this.spills.length === 0)
    spill = { type: 'stack', index: this.maxSpill++ };
  else
    spill = this.spills.pop();

  return spill;
};

Linearscan.prototype.freeSpill = function freeSpill(spill) {
  this.spills.push(spill);
};

Linearscan.prototype.splitAndSpill = function splitAndSpill(interval) {
  var queue = [];

  for (var i = 0; i < this.active.length; i++) {
    var active = this.active[i];
    if (active.value.id === interval.value.id)
      queue.push(active);
  }

  for (var i = 0; i < this.inactive.length; i++) {
    var inactive = this.inactive[i];
    var pos = inactive.nextIntersection(current);
    if (pos === null)
      continue;

    if (inactive.value.id === interval.value.id)
      queue.push(inactive);
  }

  var splitEnd = interval.start();
  for (var i = 0; i < queue.length; i++) {
    var inter = queue[i];

    var lastUse = inter.lastUse('register', splitEnd);
    var splitStart;
    if (lastUse === null)
      splitStart = inter.start();
    else
      splitStart = lastUse.instr.pos;
    this.splitBetween(inter, splitStart, splitEnd);
  }
};

Linearscan.prototype.allocate = function allocate() {
  this.spills = [];
  this.maxSpill = 0;

  this.buildIntervals();
  this.walkIntervals();
};

Linearscan.prototype.splitBetween = function splitBetween(interval, from, to) {
  var splitPos = to;
  var bestDepth = -1;
  for (var i = 0; i < this.blocks.length; i++) {
    var block = this.blocks[i];
    if (block.loopDepth >= bestDepth)
      continue;

    if (!(from < block.end && block.end <= to))
      continue;

    bestDepth = block.loopDepth;
    splitPos = block.end;
  }

  var gap = this.instructions[splitPos - 1];

  var child = this.createInterval();
  interval.split(splitPos, child);
  gap.moves.push({ from: interval, to: child });
  binaryInsert(this.unhandled, child, unhandledSort);
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
  this.moves = this.type === 'gap' ? [] : null;

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

  inputs = inputs.map(function(input) {
    if (input instanceof Instruction)
      return { type: 'instruction', id: input.pos };
    else
      return input;
  });

  var gap_state = null;
  if (this.moves) {
    gap_state = {
      actions: this.moves.map(function(move) {
        return { type: 'move', from: move.from.id, to: move.to.id };
      })
    };
  }

  return {
    id: this.pos,
    block: this.block.id,
    kind: this.type,
    inputs: inputs,
    temporary: this.scratch.map(function(interval) {
      return { type: 'interval', id: interval.id };
    }),
    output: this.output === null ? null : this.output.id,
    gap_state: gap_state
  };
};

function Interval(id) {
  this.id = id;
  this.parent = null;
  this.children = [];
  this.fixed = false;
  this.value = { type: 'virtual', id: this.id };
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

Interval.prototype.start = function start() {
  return this.ranges[0].start;
};

Interval.prototype.end = function end() {
  return this.ranges[this.ranges.length - 1].end;
};

Interval.prototype.covers = function covers(pos) {
  // TODO(indutny): binary search?
  for (var i = 0; i < this.ranges.length; i++) {
    var range = this.ranges[i];
    if (range.start <= pos && pos < range.end)
      return true;
  }

  return false;
};

Interval.prototype.nextIntersection = function nextIntersection(other) {
  for (var i = 0; i < this.ranges.length; i++) {
    var a = this.ranges[i];
    for (var j = 0; j < other.ranges.length; j++) {
      var b = other.ranges[j];
      if (b.start <= a.start && a.start < b.end)
        return a.start;
      if (a.start <= b.start && b.start < a.end)
        return b.start;
    }
  }
  return null;
};

Interval.prototype.firstUse = function firstUse(type, after) {
  var res = null;
  this.uses.some(function(use) {
    if (use.instr.pos >= after && use.kind.type === type) {
      res = use;
      return true;
    }
    return false;
  });
  return res;
};

Interval.prototype.lastUse = function lastUse(type, after) {
  var res = null;
  for (var i = this.uses.length - 1; i >= 0; i--) {
    var use = this.uses[i];
    if (use.instr.pos <= after && use.kind.type === type)
      return use;
  }
  return null;
};

Interval.prototype.split = function split(pos, child) {
  var parent = this.parent || this;

  child.parent = parent;
  parent.children.push(child);

  for (var i = 0; i < this.ranges.length; i++) {
    var range = this.ranges[i];

    if (range.end <= pos)
      continue;

    if (range.start < pos) {
      child.ranges.push({ start: pos, end: range.end });
      range.end = pos;
      i++;
    }
    break;
  }
  child.ranges = child.ranges.concat(this.ranges.slice(i));
  this.ranges = this.ranges.slice(0, i);

  for (var i = 0; i < this.uses.length; i++) {
    var use = this.uses[i];
    var usePos = use.instr.pos;

    if (usePos > pos)
      break;
  }
  child.uses = this.uses.slice(i);
  this.uses = this.uses.slice(0, i);
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

function binarySearch(list, item, compare, exact) {
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

  if (exact && start !== end)
    return null;
  else
    return start;
}

function binaryInsert(list, item, compare) {
  var start = binarySearch(list, item, compare, false);

  list.splice(start, 0, item);
}
