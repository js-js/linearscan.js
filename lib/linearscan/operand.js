'use strict';

function Operand(kind, value) {
  this.kind = kind;
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

Operand.prototype.isLink = function isLink() {
  return this.kind === 'link';
};

Operand.prototype.inspect = function inspect() {
  if (this.kind === 'any')
    return '*';
  if (this.kind === 'spill')
    return '[' + this.value + ']';
  if (this.kind === 'link')
    return '&' + this.value.pos + '';

  if (this.value === null)
    return '%*';

  return '%' + this.value;
};

Operand.prototype.isEqual = function isEqual(other) {
  return this.kind === other.kind && this.value === other.value;
};
