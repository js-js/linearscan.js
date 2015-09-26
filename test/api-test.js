'use strict';

var pipeline = require('json-pipeline');
var assertText = require('assert-text');
assertText.options.trim = true;

var linearscan = require('../');
var fixtures = require('./fixtures');
var check = fixtures.checkResolver;

describe('Interval API', function() {
  it('should respect register uses', function() {
    var p = pipeline.create('dominance');

    p.parse(fixtures.fn2str(function() {/*
      pipeline {
        b0 {
          i0 = literal 1
          i1 = literal 2
          i2 = literal 3
          i3 = literal 4
          i4 = literal 5
          i5 = call i4, i0
          i6 = add i1, i1
          i7 = add i2, i2
          i8 = add i3, i3
          i9 = add i4, i4
          i10 = return ^b0, i9
        }
      }
    */}), {
      cfg: true
    }, 'printable');

    p.reindex();

    var config = linearscan.config.create(fixtures.options);
    var out = linearscan.allocate(p, config);

    assertText.equal(out.render('printable'), fixtures.fn2str(function() {/*
      register {
        # [0, 4) as gp
        # [4, 4) as fp

        %rax = literal 1
        %rbx = literal 2
        %rcx = literal 3
        %rdx = literal 4
        [0] = ls:move.gp %rdx
        %rdx = literal 5
        [1] = ls:move.gp [0]
        [3] = ls:move.gp %rbx
        [2] = ls:move.gp %rcx
        [0] = ls:move.gp %rdx
        %rax = call %rdx, %rax
        %rax = add [3], [3]
        %rax = add [2], [2]
        %rax = add [1], [1]
        %rax = add [0], [0]
        return %rax
      }
    */}));
  });

  it('should work for two groups', function() {
    var p = pipeline.create('dominance');

    p.parse(fixtures.fn2str(function() {/*
      pipeline {
        b0 {
          i0 = literal-fp 0
          i1 = literal-fp 1
          i2 = literal-fp 2
          i3 = literal-fp 3
          i4 = literal-fp 4
          i5 = add-fp i0, i1
          i6 = add-fp i2, i3
          i7 = add-fp i5, i4
          i8 = add-fp i6, i7
          i9 = floor i8
          i10 = floor i4
          i11 = add i9, i10
          i12 = return ^b0, i11
        }
      }
    */}), {
      cfg: true
    }, 'printable');

    p.reindex();

    var config = linearscan.config.create(fixtures.options);
    var out = linearscan.allocate(p, config);

    assertText.equal(out.render('printable'), fixtures.fn2str(function() {/*
      register {
        # [0, 0) as gp
        # [0, 1) as fp

        %xmm1 = literal-fp 0
        %xmm2 = literal-fp 1
        %xmm3 = literal-fp 2
        %xmm4 = literal-fp 3
        [0] = literal-fp 4

        %xmm1 = add-fp %xmm1, %xmm2
        %xmm2 = add-fp %xmm3, %xmm4
        %xmm1 = add-fp %xmm1, [0]
        %xmm1 = add-fp %xmm2, %xmm1

        %rax = floor %xmm1
        %xmm1 = ls:move.fp [0]
        %rbx = floor %xmm1
        %rax = add %rax, %rbx
        return %rax
      }
    */}));
  });
});
