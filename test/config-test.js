'use strict';

var assertText = require('assert-text');
assertText.options.trim = true;

var fixtures = require('./fixtures');
var check = fixtures.checkResolver;

describe('Interval Resolver', function() {
  it('should respect register uses', function() {
    var r = fixtures.createResolver(fixtures.options, function() {/*
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
        }
      }
    */});

    r.resolve();

    var out = r.config.getOutput();

    assertText.equal(out.render('printable'), fixtures.fn2str(function() {/*
      register {
        %rax = literal 1
        %rbx = literal 2
        %rcx = literal 3
        %rdx = literal 4
        [0] = ls:move %3
        %rdx = literal 5
        [1] = ls:move [0]
        [3] = ls:move %1
        [2] = ls:move %2
        [0] = ls:move %3
        %rax = call %rdx, %rax
        %rax = add [3], [3]
        %rax = add [2], [2]
        %rax = add [1], [1]
        %rax = add [0], [0]
      }
    */}));
  });
});
