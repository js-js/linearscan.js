'use strict';

function Instruction(opcode, node, pos) {
  this.opcode = opcode;
  this.node = node === undefined ? null : node;
  this.pos = pos === undefined ? null : pos;

  this.output = null;
  this.inputs = [];
}
module.exports = Instruction;

Instruction.prototype.inspect = function inspect() {
  var out = this.pos + ':';
  if (this.output !== null)
    out += ' ' + this.output.inspect() + ' =';

  out += ' ' + this.opcode;
  if (this.inputs.length !== 0) {
    out += ' ' + this.inputs.map(function(i) {
      return i.inspect();
    }).join(', ');
  }

  return out;
};
