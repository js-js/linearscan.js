'use strict';

function Opcode(name) {
  this.name = name;
  this.output = null;
  this.inputs = [];
  this.spills = [];
}
module.exports = Opcode;
