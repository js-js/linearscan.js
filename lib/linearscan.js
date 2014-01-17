var assert = require('assert');

function Linearscan(options) {
  this.options = options;
  this.registers = options.registers;
  this.registerList = null;
  this.registerMap = {};
  this.declarations = {};

  // Filled during .run() call
  this.intervals = null;
  this.blockId = null;
  this.intervalId = null;
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
};

Linearscan.prototype.prerun = function preprun() {
  // Create fixed intervals for all available registers
  this.blockId = 0;
  this.intervalId = 0;
  this.intervals = {};
  this.registerList = this.registers.map(function(reg) {
    var interval = this.createInterval(reg);
    interval.fix({ type: 'register', id: reg });
    this.registerMap[reg] = interval;

    return interval;
  }, this);
};

Linearscan.prototype.run = function run(input) {
  this.prerun();

  // Clone blocks
  this.blocks = this.clone(input);

  // Verify that every phi has two to_phi's
  this.verifyPhis();

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

Linearscan.prototype.spillCount = function spillCount() {
  return this.maxSpill;
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
  var visited = [];
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
    if (visited[block.uid])
      continue;
    visited[block.uid] = true;
    for (var i = 0; i < block.successors.length; i++) {
      var succ = block.successors[i];
      if (visited[succ.uid]) {
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
    var visited = [];
    while (queue.length > 0) {
      var block = queue.shift();
      if (visited[block.uid])
        continue;
      visited[block.uid] = true;

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
      if (decl.output !== null) {
        if (instr.type === 'phi') {
          if (!block.liveKill[instr.output.id])
            block.liveGen[instr.output.id] = true;
        } else {
          block.liveKill[instr.output.id] = true;
        }
      }

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
            newOut++;
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
      if (instr.hasCall) {
        this.registerList.forEach(function(interval) {
          interval.addRange(instr.pos, instr.pos + 1);
        });
      }

      if (instr.output !== null) {
        if (instr.type === 'phi') {
          if (!instr.output.covers(instr.pos))
            instr.output.addRange(block.start, instr.pos);
        } else {
          if (instr.hasCall)
            instr.output.shortenRange(instr.pos + 1);
          else
            instr.output.shortenRange(instr.pos);
        }

        // Use call's output right after it to allow putting into reg
        if (instr.hasCall)
          instr.output.addUse(instr.pos + 1, instr, decl.output);
        else
          instr.output.addUse(instr.pos, instr, decl.output);
      }

      instr.scratch.forEach(function(scratch, i) {
        if (instr.hasCall)
          scratch.addRange(instr.pos - 1, instr.pos);
        else
          scratch.addRange(instr.pos, instr.pos + 1);
        scratch.addUse(instr.pos, instr, decl.scratch[i]);
      });

      instr.inputs.forEach(function(input, i) {
        if (input instanceof Instruction) {
          if (!input.output.covers(instr.pos))
            input.output.addRange(block.start, instr.pos);
          input.output.addUse(instr.pos, instr, decl.inputs[i]);
        }
      });
    }
  }
};

Linearscan.prototype.splitFixed = function splitFixed() {
  Object.keys(this.intervals).forEach(function(id) {
    var interval = this.intervals[id];

    var uses = interval.uses.filter(function(use) {
      return use.kind.type === 'register' && use.kind.id;
    });

    for (var i = 0; i < uses.length - 1; i++) {
      var prev = uses[i];
      var next = uses[i + 1];

      this.splitBetween(interval, prev.pos - 1, next.pos - 1);
    }
  }, this);
};

Linearscan.prototype.splitToPhis = function splitToPhis() {
  Object.keys(this.intervals).forEach(function(id) {
    var interval = this.intervals[id];

    for (var i = 0; i < interval.phiHints.length; i++) {
      var hint = interval.phiHints[i];
      var child = interval.childAt(hint.instr.pos);

      if (hint.instr.pos === child.start() || !child.covers(hint.instr.pos))
        continue;

      this.splitBetween(child, hint.instr.pos - 1, hint.instr.pos);
    }
  }, this);
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

  // Split intervals at to_phi to allow hints to work fine
  this.splitToPhis();

  // Split all fixed intervals before their fixed uses
  this.splitFixed();

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
    self.freeSpill(spill.value);
  }

  while (this.unhandled.length !== 0) {
    var current = this.unhandled.shift();
    var position = current.start();
    assert(!prev || position >= prev, 'Unstable interval processing');

    sortOut(this.active, this.inactive, position, freeReg);
    sortOut(this.activeSpills, this.inactiveSpills, position, freeSpill);

    // Skip fixed uses
    assert(current.value.type === 'virtual', 'Non-virtual unhandled');

    // Allocate register
    if (!this.allocateFree(current))
      this.allocateBlocked(current);

    // Push registers to active
    if (current.value.type === 'register')
      this.active.push(current);

    var prev = position;
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
  var hint = current.hint();
  var use = current.firstFixedUse('register', current.start());

  if (use !== null) {
    id = use.kind.id;
    maxPos = freePos[id];
  } else {
    for (var i = 0; i < this.registers.length; i++) {
      var reg = this.registers[i];
      if (freePos[reg] < maxPos ||
          freePos[reg] === maxPos &&
            !(hint !== null && hint.type === 'register' && hint.id === reg)) {
        continue;
      }
      maxPos = freePos[reg];
      id = reg;
    }
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

  function set_use(i, val) {
    usePos[i] = Math.min(usePos[i], val);
  }

  for (var i = 0; i < this.active.length; i++) {
    var active = this.active[i];
    if (active.fixed) {
      blockPos[active.value.id] = 0;
      usePos[active.value.id] = 0;
    } else {
      var use = active.firstUse('register', current.start());
      if (use !== null)
        set_use(active.value.id, use.pos);
    }
  }

  for (var i = 0; i < this.inactive.length; i++) {
    var inactive = this.inactive[i];
    var pos = inactive.nextIntersection(current);
    if (pos === null)
      continue;

    if (inactive.fixed) {
      blockPos[inactive.value.id] = pos;
      set_use(inactive.value.id, pos);
    } else {
      var use = inactive.firstUse('register', current.start());
      if (use !== null)
        set_use(inactive.value.id, use.pos);
    }
  }

  var hint = current.hint();
  var maxPos = 0;
  var id = null;
  var use = current.firstFixedUse('register', current.start());

  if (use !== null) {
    id = use.kind.id;
    maxPos = usePos[id];
  } else {
    for (var i = 0; i < this.registers.length; i++) {
      var reg = this.registers[i];
      if (usePos[reg] < maxPos ||
          usePos[reg] === maxPos &&
            !(hint !== null && hint.type === 'register' && hint.id === reg)) {
        continue;
      }
      maxPos = usePos[reg];
      id = reg;
    }
  }

  var firstUse = current.firstUse('register', 0);
  if (firstUse === null || maxPos < firstUse.pos) {
    // Spill current, all others have register uses before this one
    if (hint !== null && hint.type === 'stack') {
      current.value = hint;

      // Remove hint from free list
      this.spills = this.spills.filter(function(spill) {
        return spill.id !== hint.id;
      });
    } else {
      current.value = this.getSpill();
    }
    this.activeSpills.push(current);
    if (firstUse !== null)
      this.splitBetween(current, current.start(), firstUse.pos);
  } else {
    assert(blockPos[id] !== 0,
           'Blocked, but requires register at ' + firstUse.instr.type);

    current.value = { type: 'register', id: id };

    if (blockPos[id] < current.end())
      this.splitBetween(current, current.start(), blockPos[id]);
    this.splitAndSpill(current);
  }
};

Linearscan.prototype.getSpill = function getSpill() {
  var spill;

  if (this.spills.length === 0)
    spill = { type: 'stack', id: this.maxSpill++ };
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
    var pos = inactive.nextIntersection(interval);
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
      splitStart = lastuse.pos;

    // Do not split interval before the current
    var child = this.splitBetween(inter, splitStart, splitEnd, true);
    child.value = this.getSpill();
    this.activeSpills.push(child);

    var use = inter.firstUse('register', splitStart);
    if (use !== null)
      this.splitBetween(child, splitEnd, use.pos);
  }
};

Linearscan.prototype.resolveFlow = function resolveFlow() {
  for (var i = 0; i < this.blocks.length; i++) {
    var block = this.blocks[i];
    for (var j = 0; j < block.successors.length; j++) {
      var succ = block.successors[j];

      var gap = block.successors.length === 2 ?
          this.instructions[succ.start] :
          this.instructions[block.end - 1];

      Object.keys(succ.liveIn).forEach(function(id) {
        var interval = this.intervals[id];
        var from = interval.childAt(block.end - 1);
        var to = interval.childAt(succ.start);

        if (from !== to)
          gap.pendingMoves.push({ from: from, to: to, resolved: true });
      }, this);
    }
  }
};

Linearscan.prototype.resolveGaps = function resolveGaps() {
  Object.keys(this.instructions).map(function(id) {
    return this.instructions[id];
  }, this).forEach(function(instr) {
    if (instr.hasGap)
      instr.resolveMoves();
  });
};

Linearscan.prototype.allocate = function allocate() {
  this.spills = [];
  this.maxSpill = 0;

  this.buildIntervals();
  this.walkIntervals();
  this.resolveFlow();
  this.resolveGaps();
};

Linearscan.prototype.splitBetween = function splitBetween(interval,
                                                          from,
                                                          to,
                                                          noPush) {
  var splitPos = to;
  var bestDepth = Infinity;
  var boundary = false;

  for (var i = 0; i < this.blocks.length; i++) {
    var block = this.blocks[i];
    if (block.loopDepth >= bestDepth)
      continue;

    if (!(from < block.end && block.end <= to))
      continue;

    bestDepth = block.loopDepth;
    splitPos = block.end;
    boundary = true;
  }

  if (from === block.start)
    boundary = true;

  // Insert movement if not on a block edge
  var gap = this.instructions[splitPos];
  if (!gap.hasGap) {
    splitPos--;
    gap = this.instructions[splitPos];
  }
  assert(from <= splitPos && splitPos <= to, 'Split OOB');
  assert(gap.hasGap);

  var child = this.createInterval();
  interval.split(splitPos, child);

  if (!noPush)
    binaryInsert(this.unhandled, child, unhandledSort);

  // If not a block boundary, and not a to_phi - insert move
  var next = this.instructions[splitPos + 1];

  if (!boundary && !(next.type === 'to_phi' && next.output === interval))
    gap.pendingMoves.push({ from: interval, to: child });

  return child;
};

Linearscan.prototype.verifyPhis = function verifyPhis() {
  for (var i = 0; i < this.blocks.length; i++) {
    var block = this.blocks[i];

    var phis = {};
    var phiCount = 0;
    for (var j = 0; j < block.instructions.length; j++) {
      var instr = block.instructions[j];
      if (instr.type !== 'phi')
        continue;
      assert(instr.id, 'Every phi should have an id');
      assert(!phis[instr.id], 'Double phi!');
      phis[instr.id] = true;
      phiCount++;
    }

    if (phiCount === 0)
      continue;

    assert(block.predecessors.length === 2,
           'Blocks with phis should have 2 predecessors');
    for (var j = 0; j < block.predecessors.length; j++) {
      var pred = block.predecessors[j];
      var found = {};

      for (var k = 0; k < pred.instructions.length; k++) {
        var instr = pred.instructions[k];

        if (instr.type !== 'to_phi')
          continue;
        assert(phis[instr.phi.id], 'to_phi without phi in successor');

        found[instr.phi.id] = true;
      }

      assert(Object.keys(found).length === phiCount,
             'Phi mismatch from: ' + pred.id + ' to: ' + block.id);
    }
  }
};

Linearscan.prototype.strip = function strip() {
  return this.blocks.map(function(block) {
    return block.strip();
  });
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
  var interval = new Interval(this, id);

  this.intervals[id] = interval;

  return interval;
};

//
// Various entities
//

function Block(ls, block, instructions) {
  this.id = block.id;
  this.uid = ls.blockId++;
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

Block.prototype.strip = function strip() {
  return {
    id: this.id,
    instructions: this.instructions.map(function(instr) {
      return instr.strip();
    }).filter(function(instr) {
      return !(instr.type === 'gap' && instr.moves.length === 0) &&
             !(instr.type === 'phi') &&
             !(instr.type === 'to_phi' &&
               instr.output.type === instr.inputs[0].type &&
               instr.output.id === instr.inputs[0].id);
    }),
    successors: this.successors.map(function(succ) {
      return succ.id;
    })
  };
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
  assert(this.predecessors.length === 2);
};

function Instruction(ls, block, instr) {
  this.ls = ls;
  this.id = instr.id || null;
  this.type = instr.type;
  this.decl = ls.declarations[this.type];
  assert(this.decl, 'No decl for: ' + this.type);
  this.block = block;

  this.hasCall = this.decl.call;
  var hasGap = this.type === 'gap' || this.hasCall;
  this.hasGap = hasGap;
  this.moves = hasGap ? [] : null;
  this.pendingMoves = hasGap ? [] : null;

  this.inputs = instr.inputs ? instr.inputs.slice() : [];
  this.output = this.type === 'to_phi' || this.decl.output === null ?
      null :
      ls.createInterval();
  this.scratch = this.decl.scratch.map(function(scratch) {
    return ls.createInterval();
  });
  this.pos = null;
  this.initialized = false;

  // Used only for `to_phi` type
  this.phi = null;
}

Instruction.prototype.init = function init(instructions) {
  this.initialized = true;

  if (this.type === 'to_phi') {
    var phi = this.inputs.shift();
    phi = instructions[phi.id];
    assert(phi, 'Phi not found: ' + phi.id);
    assert(this.inputs.length === 1, 'Not enough inputs at to_phi:' + this.id);

    // to_phi has a phi as it's output
    this.output = phi.output;
    this.phi = phi;
  }

  this.inputs = this.inputs.map(function(input) {
    if (!input || input.type !== 'instruction')
      return input;

    var res = instructions[input.id];
    assert(res, 'Input not found: ' + input.id);
    if (!res.initialized)
      res.init(instructions);
    return res;
  }, this);

  if (this.phi !== null)
    this.output.phiHints.push({ instr: this, hint: this.inputs[0].output });
};

Instruction.prototype.resolveMoves = function resolveMoves() {
  // Do parallel move resolution
  var moves = this.pendingMoves;
  this.pendingMoves = [];
  var status = moves.map(function() { return 'to_move' });

  moves = moves.map(function(move) {
    if (move.resolved)
      return move;

    var neighboors = move.from.getNeighbors(this.pos);
    return {
      from: neighboors.left,
      to: neighboors.right
    };
  }, this);

  var out = this.moves;

  // Put all moves from call instruction to the previous gap
  if (this.hasCall)
    out = this.ls.instructions[this.pos - 1].moves;

  for (var i = 0; i < moves.length; i++)
    if (status[i] === 'to_move')
      this.resolveOne(moves, status, i, out);
};

Instruction.prototype.resolveOne = function resolveOne(moves, status, i, res) {
  var current = moves[i];

  var from = current.from.value;
  var to = current.to.value;

  // Ignore nop-moves
  if (from.type === to.type && from.id === to.id) {
    status[i] = 'moved';
    return;
  }

  // Detect cycles
  var circular = false;
  var sentinel = false;
  status[i] = 'moving';
  for (var j = 0; j < moves.length; j++) {
    var next = moves[j];
    var nextFrom = next.from.value;

    if (i === j || nextFrom.type !== to.type || nextFrom.id !== to.id)
      continue;

    // (current) -> (next)
    if (status[j] === 'to_move') {
      if (this.resolveOne(moves, status, j, res)) {
        if (circular)
          throw new Error('Two move cycles');
        circular = true;
      }
    } else if (status[j] === 'moving') {
      sentinel = true;
    } else if (status[j] === 'moved') {
      // Ignore
    }
  }

  if (circular)
    res.push({ type: 'swap', from: from, to: to });
  else if (!sentinel)
    res.push({ type: 'move', from: from, to: to });

  status[i] = 'moved';

  return circular || sentinel;
};

Instruction.prototype.strip = function strip() {
  var inputs = this.inputs;

  inputs = inputs.map(function(input) {
    if (input instanceof Instruction)
      return input.output.childAt(this.pos).value;
    else
      return input;
  }, this);

  return {
    id: this.id,
    type: this.type,
    inputs: inputs,
    moves: this.moves,
    scratch: this.scratch.map(function(interval) {
      return interval.childAt(this.pos).value;
    }, this),
    output: this.output === null ? null : this.output.childAt(this.pos).value
  };
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
      actions: this.moves
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

function Interval(ls, id) {
  this.ls = ls;
  this.id = id;
  this.parent = null;
  this.children = [];
  this.fixed = false;
  this.value = { type: 'virtual', id: this.id };
  this.uses = [];
  this.ranges = [];
  this.phiHints = [];
}

Interval.prototype.fix = function fix(value) {
  this.fixed = true;
  this.value = value;

  return this;
};

function useSort(a, b) {
  return a.pos - b.pos;
}

Interval.prototype.addUse = function addUse(pos, instr, kind) {
  binaryInsert(this.uses, {
    pos: pos,
    instr: instr,
    kind: kind
  }, useSort);
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
    if (use.pos >= after && use.kind.type === type) {
      res = use;
      return true;
    }
    return false;
  });
  return res;
};

Interval.prototype.firstFixedUse = function firstFixedUse(type, after) {
  var res = null;
  this.uses.some(function(use) {
    if (use.pos >= after && use.kind.type === type && use.kind.id) {
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
    if (use.pos <= after && use.kind.type === type)
      return use;
  }
  return null;
};

Interval.prototype.split = function split(pos, child) {
  var parent = this.parent || this;

  child.parent = parent;
  child.phiHints = parent.phiHints;

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

  assert(child.ranges.length > 0 && this.ranges.length > 0, 'Split error');

  for (var i = 0; i < this.uses.length; i++) {
    var use = this.uses[i];
    var usePos = use.pos;

    if (usePos > pos)
      break;
    if (usePos === pos) {
      if (this.ls.instructions[pos].hasCall)
        i++;
      break;
    }
  }
  child.uses = this.uses.slice(i);
  this.uses = this.uses.slice(0, i);

  binaryInsert(parent.children, child, unhandledSort);
};

Interval.prototype.hint = function hint() {
  var hints = this.phiHints.filter(function(hint) {
    return hint.hint.value.type === 'register';
  });

  var interval;
  if (hints.length > 0) {
    interval = hints[hints.length - 1].hint;
  } else if (this.parent) {
    // Choose previous child
    var i = this.parent.children.indexOf(this);
    interval = this.parent.children[i - 1] || this.parent;
  }

  if (!interval)
    return null;
  return interval.value.type === 'virtual' ? null : interval.value;
};

Interval.prototype.childAt = function childAt(pos) {
  if (this.parent)
    return this.parent.childAt(pos);

  var hasUse = this.uses.some(function(use) {
    return use.pos === pos;
  });
  if (pos < this.end() || hasUse)
    return this;

  for (var i = 0; i < this.children.length; i++) {
    var child = this.children[i];
    var hasUse = child.uses.some(function(use) {
      return use.pos === pos;
    });
    if (pos < child.end() || hasUse)
      return child;
  }

  return this;
};

Interval.prototype.getNeighbors = function getNeighbors(pos) {
  if (this.parent)
    return this.parent.getNeighbors(pos);

  assert(this.end() <= pos, 'split before end of parent?');
  var prev = this;
  for (var i = 0; i < this.children.length; i++) {
    var child = this.children[i];
    if (child.start() >= pos)
      return { left: prev, right: child };

    prev = child;
  }
  assert(false, 'No children');
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
        pos: use.pos,
        kind: use.kind.type === 'register' && use.kind.id ?
            'fixed' :
            use.kind.type
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
