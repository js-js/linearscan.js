'use strict';

function Instruction(opcode, node, pos) {
  this.opcode = opcode;
  this.node = node === undefined ? null : node;
  this.pos = pos === undefined ? null : pos;

  this.output = null;
  this.inputs = [];

  this.links = [];
  this.linkUses = [];
}
module.exports = Instruction;

Instruction.prototype.inspect = function inspect() {
  var out = this.pos + ':';
  if (this.output !== null)
    out += ' ' + this.output.inspect() + ' =';

  out += ' ' + this.opcode.name;
  if (this.inputs.length !== 0) {
    out += ' ' + this.inputs.map(function(i) {
      return i.inspect();
    }).join(', ');
  }

  if (this.links.length !== 0) {
    out += ' ' + this.links.map(function(i) {
      return '&' + i.pos;
    }).join(', ');
  }

  return out;
};

Instruction.prototype.link = function link(other) {
  other.linkUses.push(this);
  this.links.push(other);
};
