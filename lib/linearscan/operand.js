'use strict';

var assert = require('assert');

function Operand(kind, group, value) {
  this.kind = kind;
  this.group = group;
  this.value = value === undefined ? null : value;
}
module.exports = Operand;

Operand.prototype.isAny = function isAny() {
  return this.kind === 'any';
};

Operand.prototype.isRegister = function isRegister() {
  return this.kind === 'register';
};

Operand.prototype.isFixed = function isFixed() {
  return this.kind === 'register' && this.value !== null;
};

Operand.prototype.isSpill = function isSpill() {
  return this.kind === 'spill';
};

Operand.prototype.inspect = function inspect() {
  if (this.kind === 'any')
    return '*';
  if (this.kind === 'spill')
    return '[' + this.value + ']';

  if (this.value === null)
    return '%*';

  return '%' + this.value;
};

Operand.prototype.isEqual = function isEqual(other) {
  return this.kind === other.kind && this.value === other.value;
};

Operand.prototype.toPipeline = function toPipeline(config, p) {
  if (this.kind === 'register')
    return p.reg(config.getRegisterName(this.group, this.value));

  return p.spill(config.getSpillOffset(this.group) + this.value);
};

Operand.prototype.getIndex = function getIndex() {
  if (this.isRegister())
    return this.value;
  else
    return -1 - this.value;
};

Operand.prototype.getAbsIndex = function getAbsIndex(config) {
  if (this.isRegister())
    return config.getRegOffset(this.group) + this.value;
  else
    return -1 - config.getSpillOffset(this.group) - this.value;
};

Operand.prototype.merge = function merge(other) {
  // any + X = X
  if (this.kind === 'any') {
    if (other.kind === 'any')
      return this;
    return other;
  }

  if (this.kind === 'register') {
    if (this.value === null) {
      // reg + reg = reg
      if (other.value === null)
        return this;

      // reg + fixed reg = fixed reg
      else
        return new Operand(this.kind, this.group, other.value);
    }
  }

  assert(this.kind !== 'spill' && other.kind !== 'spill',
         'Can\'t merge spills');

  assert(false, 'Can\'t merge two fixed operands');
  return null;
};
