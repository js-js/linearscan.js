'use strict';

function Opcode(name) {
  this.name = name;
  this.output = null;
  this.inputs = [];
  this.scratches = [];
  this.spills = [];
}
module.exports = Opcode;
