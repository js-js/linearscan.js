'use strict';

var util = require('util');
var binarySearch = require('binary-search');
var parallelMove = require('parallel-move');

var linearscan = require('../linearscan');
var Instruction = linearscan.Instruction;

function Move(from, to) {
  this.from = from;
  this.to = to;
}

// reg0, reg1, reg2, reg3, ... , spill0, spill1, spill2, ...
Move.sort = function sort(a, b) {
  if (a.from.kind === b.from.kind)
    return a.from.value - b.from.value;

  if (a.from.kind === 'register')
    return -1;
  else
    return 1;
};

Move.prototype.inspect = function inspect() {
  return this.from.inspect() + '=>' + this.to.inspect();
};

function Gap(pos) {
  Instruction.call(this, 'ls:gap', null, pos);

  this.unhandled = [];
  this.moves = [];
}
util.inherits(Gap, Instruction);
module.exports = Gap;

Gap.Move = Move;

Gap.prototype.addMove = function addMove(from, to) {
  var move = new Move(from, to);
  var index = binarySearch(this.unhandled, move, Move.sort);
  if (index < 0)
    index = -1 - index;
  this.unhandled.splice(index, 0, move);
};

Gap.prototype.resolve = function resolve() {
  var pm = parallelMove.create();

  for (var i = 0; i < this.unhandled.length; i++) {
    var move = this.unhandled[i];
    pm.add(move.from.getIndex(), move.to.getIndex());
  }

  this.unhandled = [];
  this.resolved = pm.resolve();
};

Gap.prototype.inspect = function inspect() {
  var out = this.pos + ': gap';

  if (this.unhandled.length > 0) {
    out += ' {' + this.unhandled.map(function(move) {
      return move.inspect();
    }).join(',') + '}';
  }

  if (this.moves.length > 0) {
    out += ' [' + this.unhandled.map(function(move) {
      return move.inspect();
    }).join(',') + ']';
  }

  return out;
};
