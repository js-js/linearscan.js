'use strict';

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
    return p.reg(config.getRegisterNameByGroup(this.group, this.value));

  return p.spill(config.getSpillOffset(this.group) + this.value);
};

Operand.prototype.getIndex = function getIndex(config) {
  if (this.isRegister())
    return config.getRegOffset(this.group) + this.value;
  else
    return -1 - config.getSpillOffset(this.group) - this.value;
};

Operand.prototype.resolve = function resolve() {
  return this;
};
