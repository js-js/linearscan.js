'use strict';

function Opcode(name) {
  this.name = name;
  this.output = null;
  this.inputs = [];
  this.spills = [];
  this.scratches = [];
  this.isBranch = false;
}
module.exports = Opcode;
