'use strict';

function Instruction(opcode, node) {
  this.opcode = opcode;
  this.node = node === undefined ? null : node;
}
module.exports = Instruction;
