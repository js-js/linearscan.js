'use strict';

exports.Operand = require('./linearscan/operand');
exports.DynamicOperand = require('./linearscan/dynamic-operand');
exports.Opcode = require('./linearscan/opcode');
exports.Use = require('./linearscan/use');
exports.Range = require('./linearscan/range');
exports.Interval = require('./linearscan/interval');
exports.Instruction = require('./linearscan/instruction');
exports.Gap = require('./linearscan/gap');

exports.Config = require('./linearscan/config');
exports.config = exports.Config;

exports.Builder = require('./linearscan/builder');
exports.builder = exports.Builder;

exports.Allocator = require('./linearscan/allocator');
exports.allocator = exports.Allocator;

exports.Resolver = require('./linearscan/resolver');
exports.resolver = exports.Resolver;

exports.allocate = require('./linearscan/api').allocate;
