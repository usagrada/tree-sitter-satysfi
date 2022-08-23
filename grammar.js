// vim:sw=2
const PREC = {
  application: 11,
  constructor: 10,
  unary: 10,
  divisive: 9,
  multiplicative: 9,
  additive: 8,
  subtractive: 8,
  comparative: 7,
  concat: 6,
  and: 5,
  or: 4,
  assign: 3,

  typeApplication: 3,
  typeProduct: 2,
  typeFunction: 1,

  signatureFunctor: 2,
  signatureWithType: 1,
};

// [-+*/^&|=<>!:~'.?]
const OPERATOR_PREC = [
  [PREC.and, /&[-+*/^&|=<>!:~'.?]+/],
  [PREC.or, /\|[-+*/^&|=<>!:~'.?]+/],
  [PREC.comparative, /=[-+*/^&|=<>!:~'.?]+/],
  // <- は許されない
  [PREC.comparative, /<[+*/^&|=<>!:~'.?]?/],
  [PREC.comparative, /<[-+*/^&|=<>!:~'.?]{2,}/],
  [PREC.comparative, />[+*/^&|=<>!:~'.?]*/],
  [PREC.concat, /\^[-+*/^&|=<>!:~'.?]*/],
  [PREC.concat, "::"],
  [PREC.additive, /\+[-+*/^&|=<>!:~'.?]*/],
  // -> は許されない
  [PREC.subtractive, /-[+*/^&|=<!:~'.?]?/],
  [PREC.subtractive, /-[-+*/^&|=<>!:~'.?]{2,}/],
  [PREC.multiplicative, /\*[-+*/^&|=<>!:~'.?]*/],
  [PREC.divisive, /\/[-+*/^&|=<>!:~'.?]*/],
  [PREC.divisive, "mod"],
];

const INLINE_CMD_NAME = /\\([A-Z][-A-Za-z0-9]*\.)*[A-Za-z][-A-Za-z0-9]*/;
const BLOCK_CMD_NAME = /\+([A-Z][-A-Za-z0-9]*\.)*[A-Za-z][-A-Za-z0-9]*/;
const VARIABLE_NAME = /[a-z][-A-Za-z0-9]*/;
const MODULE_NAME = /[A-Z][-A-Za-z0-9]*/;
const TYPE_VARIABLE = /'[a-z][-A-Za-z0-9]*/;
const ROW_VARIABLE = /'?[a-z][-A-Za-z0-9]*/;

const tokens = {
  whitespace: /\s+/,
  cmd_name: /[A-Za-z][-A-Za-z0-9]*/,
}

const tokenGrammar = Object.fromEntries(
  Object.entries(tokens).map(
    ([k, v]) => [k, (_) => v]
  )
)


module.exports = grammar({
  name: "satysfi",

  extras: ($) => [/\s/, $.comment],

  // word: ($) => $.var_name,

  supertype: ($) => [
    $._module,
    $._binding,
    $._signature,
    $._declaration,
    $._type,
    $._expr,
    $._pattern,
    $._bind_val_single,
  ],

  conflicts: ($) => [],

  externals: ($) => [
    $.literal_string,
    // {} の中に入っているインラインテキスト。
    $.inline_token,
    // {||} や {* } の中に入っているインラインテキスト。
    $._inline_token_compound,
    // 決してマッチしないダミーパターン。
    $._dummy,
    // 空白やコメントが入らないことを保証するが、 Lexer は進めない。
    $._numbersign_after_nospace,
    // $.no_extras,
  ],

  rules: {
    source_file: ($) =>
      choice(
        $.program_saty,
        $.program_satyh,
      ),

    program_satyh: $ => seq(
        optional($.headers),
        "module",
        $.module_name,
        optional(seq(":>", $._signature)),
        "=",
        $._module,
    ),

    program_saty: $ =>
      seq(
        optional(field("stage", $.header_stage)),
        optional(field("headers", $.headers)),
        field("expr", $._expr),
      ),

    ...tokenGrammar,

    comment: (_) => token(seq("%", /.*/)),

    //$1 header
    headers: ($) => seq(repeat1($._header)),

    _header: ($) =>
      choice(
        seq(
          "@require:",
          optional($.whitespace),
          // $.no_extras,
          field("require", $.pkgname),
          "\n",
        ),
        seq(
          "@import:",
          repeat(/\s/),
          // $.no_extras,
          field("import", $.pkgname),
          "\n",
        ),
      ),

    header_stage: (_) =>
      seq(
        "@stage:",
        choice(
          field("0", "0"),
          field("1", "1"),
          field("persistent", "persistent"),
        ),
        "\n",
      ),

    pkgname: (_) => /[^\n\r]+/,

    //$1 module expression
    _module: ($) =>
      choice(
        seq("(", $._module, ")"),
        $.module_path,
        $.module_functor_abstraction,
        $.module_functor_application,
        $.module_structure,
        $.module_coerction,
      ),

    module_path: ($) => sep($.module_name, "."),
    module_functor_abstraction: ($) =>
      seq("fun", "(", $.module_name, ":", $._signature, ")", "->", $._module),
    module_functor_application: ($) =>
      seq(
        sep($.module_name, "."),
        sep($.module_name, "."),
      ),
    module_structure: ($) => seq("struct", repeat($._binding), "end"),
    module_coerction: ($) =>
      seq(sep($.module_name, "."), ":>", $._signature),

    module_name: (_) => MODULE_NAME,

    _binding: ($) =>
      choice(
        $.bind_val,
        $.bind_type,
        $.bind_module,
        $.bind_signature,
        $.bind_include,
      ),

    bind_val: ($) => seq("val", $._bind_val),
    bind_type: ($) => seq("type", $._bind_type),
    bind_module: ($) =>
      seq(
        "module",
        $.module_name,
        optional(seq(":>", $._signature)),
        "=",
        $._module,
      ),
    bind_signature: ($) => seq("signature", $.module_name, "=", $._signature),
    bind_include: ($) => seq("include", $._module),

    _bind_val: ($) =>
      choice(
        $._bind_val_single,
        seq("rec", sep($._bind_val_single, "and")),
      ),

    _bind_val_single: ($) => choice(
        $.bind_val_variable,
        $.bind_val_math_cmd,
        $.bind_val_inline_cmd,
        $.bind_val_block_cmd,
      ),

    bind_val_variable: $ => seq(
          field("name", $.var_name),
          optional($.quant),
          repeat(field("param", $.bind_val_parameter)),
          "=",
          field("expr", $._expr),
        ),

    bind_val_math_cmd: $ => seq(
          "math",
          $.var_name,
          $.math_cmd_name,
          repeat(field("param", $.bind_val_parameter)),
          "=",
          field("expr", $._expr),
        ),

    bind_val_inline_cmd: $ => seq(
          "inline",
          $.var_name,
          $.inline_cmd_name,
          repeat(field("param", $.bind_val_parameter)),
          "=",
          field("expr", $._expr),
        ),

    bind_val_block_cmd: $ => seq(
          "block",
          $.var_name,
          $.block_cmd_name,
          repeat(field("param", $.bind_val_parameter)),
          "=",
          field("expr", $._expr),
        ),

    bind_val_parameter: ($) =>
      seq(
        optional(seq("?(", ")")),
        optional(seq("?(", sep($.opt_parameter, ","), ")")),
        $.parameter,
      ),

    _bind_type: ($) => sep($.bind_type_single, "and"),
    bind_type_single: ($) =>
      choice(
        seq($.type_name, repeat($.type_var), "=", $._type),
        seq(
          $.type_name,
          repeat($.type_var),
          "=",
          "|",
          sep($.constructor_branch, "|"),
        ),
      ),

    constructor_branch: ($) => seq($.variant_name, "of", $._type),

    opt_parameter: ($) =>
      seq(
        $.label_name,
        "=",
        $._pattern,
        optional(seq(":", $._type)),
        optional(seq("=", $._expr)),
      ),
    parameter: ($) =>
      choice($._pattern, seq("(", $._pattern, ":", $._type, ")")),

    _signature: ($) =>
      choice(
        seq("(", $._signature, ")"),
        $.signature_path,
        $.signature_functor,
        $.signature_structure,
        $.signature_with_bind_type,
      ),

    signature_functor: ($) =>
      prec(
        PREC.signatureFunctor,
        seq("(", $.module_name, ":", $._signature, ")", "->", $._signature),
      ),
    signature_with_bind_type: ($) =>
      prec(
        PREC.signatureWithType,
        seq($._signature, seq("with", "type", $.bind_type)),
      ),
    signature_path: ($) => sep($.module_name, "."),
    signature_structure: ($) => seq("sig", repeat($._declaration), "end"),

    //$1 declaration
    _declaration: ($) =>
      choice(
        $.declaration_val,
        $.declaration_type_kind,
        $.declaration_type,
        $.declaration_module,
        $.declaration_signature,
        $.declaration_include,
      ),
    declaration_val: ($) => seq(
      "val",
      field("var", $.var_name),
      optional($.quant), ":",
      field("type", $._type)
    ),
    declaration_type_kind: ($) => seq("type", $.type_name, "::", $.type_kind),
    declaration_type: ($) => seq("type", $.bind_type),
    declaration_module: ($) => seq("module", $.module_name, ":", $._signature),
    declaration_signature: ($) =>
      seq("signature", $.module_name, "=", $._signature),
    declaration_include: ($) => seq("include", $._signature),

    type_kind: ($) => sep($.base_kind, "->"),
    base_kind: (_) => "o",

    row_kind: ($) =>
      seq("(", "|", sep($.label_name, ","), "|", ")"),

    label_name: (_) => VARIABLE_NAME,

    //$1 type
    _type: ($) =>
      choice(
        $.type_single,
        $.type_application,
        $.type_function,
        $.type_product,
        $.type_parened,
        $.type_record,
        $.type_var,
        $.type_math_cmd,
        $.type_inline_cmd,
        $.type_block_cmd,
      ),

    type_single: $ => seq(
      repeat(seq($.module_name, ".")),
      $.type_name,
    ),

    type_application: $ => prec.right(
          PREC.typeApplication,
          seq(
            $.type_single,
            repeat1($._type)
          ),
        ),

    type_function: $ => prec.right(
          PREC.typeFunction,
          seq(
            optional($.type_opts),
            field("arg", $._type),
            "->",
            field("ret", $._type)
          ),
        ),

    type_product: $ => prec.left(PREC.typeProduct, seq($._type, "*", sep($._type, "*"))),

    type_parened: $ => seq("(", $._type, ")"),

    type_record: $ => seq(
          "(",
          "|",
          sep(seq($.label_name, ":", $._type), ","),
          "|",
          ")",
        ),

    type_math_cmd: $ => seq("math", $.cmd_parameter_types),
    type_inline_cmd: $ => seq("inline", $.cmd_parameter_types),
    type_block_cmd: $ => seq("block", $.cmd_parameter_types),

    type_var: (_) => TYPE_VARIABLE,

    cmd_parameter_types: ($) =>
      choice(
        seq("[", "]"),
        seq("[", sep($.cmd_parameter_type, ","), "]"),
      ),

    cmd_parameter_type: ($) =>
      seq(optional(seq($.type_opts_closed, ",")), $._type),

    type_opts: ($) =>
      choice(
        $.type_opts_closed,
        seq(
          "?(",
          sep(seq($.label_name, ":", $._type), ","),
          ",",
          $.row_var,
          ")",
        ),
      ),

    type_opts_closed: ($) =>
      seq("?(", sep(seq($.label_name, ":", $._type), ","), ")"),

    quant: ($) =>
      choice(
        seq(repeat1($.type_var), repeat(seq($.row_var, "::", $.row_kind))),
        repeat1(seq($.row_var, "::", $.row_kind)),
      ),

    row_var: (_) => ROW_VARIABLE,

    //$1 expr
    _expr: ($) =>
      choice(
        seq("(", $._expr, ")"),
        $.expr_application,
        $.expr_constructor,
        $.expr_modvar,
        $.expr_lambda,
        $.expr_bind,
        $.expr_open,
        $.expr_match,
        $.expr_if,
        $.expr_binary_operation,
        $.expr_binary_operator,
        $.expr_unary_operation,
        $.expr_literal,
        $.expr_inline_text,
        $.expr_block_text,
        $.expr_math_text,
        $.expr_record,
        $.expr_list,
        $.expr_tuple,
      ),

    expr_application: ($) =>
      prec.left(
        PREC.application,
        seq(
          field("function", $._expr),
          field("opt_arg", optional($.expr_opts)),
          field("arg", $._expr),
        ),
      ),
    expr_constructor: ($) =>
      prec.left(
        PREC.constructor,
        seq(repeat(seq($.module_name, ".")), $.variant_name, optional($._expr)),
      ),
    expr_modvar: ($) => seq(repeat(seq($.module_name, ".")), $.var_name),
    expr_lambda: ($) => seq("fun", repeat($.bind_val_parameter), "->", $._expr),
    expr_bind: ($) =>
      choice(
        seq("let", $._bind_val, "in", $._expr),
        seq("let", $._non_var_pattern, "=", $._expr, "in", $._expr),
      ),
    expr_open: ($) =>
      seq(
        "let",
        "open",
        sep($.module_name, "."),
        "in",
        $._expr,
      ),
    expr_match: ($) =>
      seq(
        "match",
        field("expr", $._expr),
        "with",
        optional("|"),
        sep(seq($._pattern, "->", $._expr), "|"),
        "end",
      ),
    expr_if: ($) => seq("if", $._expr, "then", $._expr, "else", $._expr),
    expr_binary_operation: ($) => $._binary_expr,
    expr_binary_operator: ($) => seq("(", $.binary_operator, ")"),
    expr_unary_operation: ($) => seq($._un_op, $._expr),
    expr_literal: ($) =>
      choice(
        seq($.matchable_const),
        seq($.non_matchable_const),
      ),

    expr_record: ($) =>
      choice(
        seq("(|", $._expr, "with", $._record_inner, "|)"),
        seq("(|", optional($._record_inner), "|)"),
      ),

    _record_inner: ($) =>
      seq(sep($.record_unit, ","), optional(",")),

    record_unit: ($) => seq($.label_name, "=", $._expr),

    expr_list: ($) =>
      choice(
        seq("[", "]"),
        seq("[", sep($._expr, ","), optional(","), "]"),
      ),

    expr_tuple: ($) =>
      seq(
        "(",
        $._expr, ",",
        sep($._expr, ","),
        ")",
      ),

    expr_inline_text: ($) => seq("{", optional($.horizontal), "}"),
    expr_block_text: ($) => seq("'<", optional($.vertical), ">"),
    expr_math_text: ($) => seq("${", optional($.math), "}"),

    binary_operator: ($) =>
      choice(...OPERATOR_PREC.map(([_prec, operator]) => operator)),

    _binary_expr: ($) =>
      choice(
        ...OPERATOR_PREC.map(([precedence, operator]) =>
          prec.left(
            precedence,
            seq(
              field("left", $._expr),
              field("operator", alias(operator, "bin_op")),
              field("right", $._expr),
            ),
          )
        ),
      ),

    _un_op: (_) => choice("-", "not"),

    expr_opts: ($) =>
      seq("?(", sep(seq($.label_name, "=", $._expr), ","), ")"),

    matchable_const: ($) =>
      choice(
        seq("(", ")"),
        "true",
        "false",
        $.literal_int,
        $.literal_string,
      ),

    non_matchable_const: ($) =>
      choice(
        $.literal_float,
        $.literal_length,
      ),

    _pattern: ($) =>
      choice(
        $.var_name,
        $._non_var_pattern,
      ),

    _non_var_pattern: ($) =>
      choice(
        seq("(", $._non_var_pattern, ")"),
        $.pattern_ignore,
        $.pattern_variant,
        $.pattern_tuple,
        $.pattern_const,
      ),

    pattern_ignore: ($) => "_",
    pattern_variant: ($) => $.variant,
    pattern_tuple: ($) => seq("(", $._pattern, ",", sep($._pattern, ","), ")"),
    pattern_const: ($) => $.matchable_const,

    variant: ($) =>
      prec.right(
        seq(
          repeat(seq($.module_name, ".")),
          $.variant_name,
          optional($._pattern),
        ),
      ),

    //$1 mode

    inline_text: ($) => seq("{", optional($.horizontal), "}"),

    inline_text_list: ($) =>
      choice(
        seq(
          "{",
          "|",
          optional(alias($._horizontal_compound, $.horizontal)),
          repeat(
            seq("|", optional(alias($._horizontal_compound, $.horizontal))),
          ),
          /\|\s*\}/,
        ),
      ),

    inline_text_bullet_list: ($) =>
      seq(
        "{",
        repeat1($.inline_text_bullet_item),
        "}",
      ),

    horizontal: ($) =>
      repeat1(choice(
        $.inline_literal_escaped,
        $.inline_text_embedding,
        $.math_text,
        $.literal_string,
        $.inline_cmd,
        $.inline_token,
      )),

    _horizontal_compound: ($) =>
      repeat1(choice(
        $.inline_literal_escaped,
        $.inline_cmd,
        alias($._inline_token_compound, $.inline_token),
      )),

    inline_text_bullet_item: ($) =>
      seq(
        $.inline_text_bullet_star,
        optional(alias($._horizontal_compound, $.horizontal)),
      ),
    inline_text_bullet_star: (_) => /\*+/,

    inline_literal_escaped: (_) =>
      choice(
        "\\@",
        "\\`",
        "\\\\",
        "\\{",
        "\\}",
        "\\%",
        "\\|",
        "\\*",
        "\\$",
        "\\#",
        "\\;",
        "\\ ",
      ),

    inline_text_embedding: ($) =>
      seq($._numbersign_after_nospace, $.var_name, ";"),

    block_text: ($) => seq("'<", optional($.vertical), ">"),

    vertical: ($) =>
      repeat1(choice(
        $.block_cmd,
        $.block_text_embedding,
      )),

    block_text_embedding: ($) =>
      seq($._numbersign_after_nospace, $.var_name, ";"),

    math_text: ($) => seq("${", optional($.math), "}"),

    math_list: ($) =>
      choice(
        seq("${", "|", "|", "}"),
        seq("${", "|", repeat(seq($.math, "|")), "}"),
      ),

    math: ($) => prec.left(0, repeat1(choice($.math_token, $.math_unary))),

    math_token: ($) =>
      prec.left(
        0,
        choice(
          seq(
            $.math_unary,
            field("sup", $._math_sup),
            field("sub", $._math_sub),
          ),
          seq(
            $.math_unary,
            field("sub", $._math_sub),
            field("sup", $._math_sup),
          ),
          seq($.math_unary, field("sup", $._math_sup)),
          seq($.math_unary, field("sub", $._math_sub)),
        ),
      ),

    _math_sup: ($) => seq("^", $._math_group),

    _math_sub: ($) => seq("_", $._math_group),
    _math_group: ($) =>
      choice(
        $.math_unary,
        seq("{", $.math, "}"),
      ),

    math_unary: ($) =>
      choice(
        /[A-Za-z0-9]/,
        /\\[!"#$%&'()*+,./0-9:;<=>?@^_`{|}~-]/,
        "\\\\",
        /[+*/:=<>~'.,?`-]/,
        $.math_cmd,
        $.math_embedding,
      ),

    math_embedding: ($) => seq($._numbersign_after_nospace, $.var_name, ";"),

    //$1 commands
    inline_cmd: ($) =>
      seq(
        field("name", $.inline_cmd_name),
        repeat(
          choice(field("arg", $.cmd_expr_arg), field("opt", $.cmd_expr_option)),
        ),
        choice(repeat1(field("arg", $.cmd_text_arg)), ";"),
      ),

    block_cmd: ($) =>
      seq(
        field("name", $.block_cmd_name),
        repeat(
          choice(field("arg", $.cmd_expr_arg), field("opt", $.cmd_expr_option)),
        ),
        choice(repeat1(field("arg", $.cmd_text_arg)), ";"),
      ),

    cmd_expr_arg: ($) => $._cmd_expr_arg_inner,
    cmd_expr_option: ($) => seq("?:", $._cmd_expr_arg_inner),
    cmd_text_arg: ($) =>
      choice(
        seq("{", optional($.horizontal), "}"),
        seq("<", optional($.vertical), ">"),
      ),
    _cmd_expr_arg_inner: ($) => seq("(", $._expr, ")"),

    math_cmd: ($) =>
      prec.left(
        1,
        seq(
          field("name", $.math_cmd_name),
          repeat(
            choice(
              field("arg", $.math_cmd_expr_arg),
              field("opt", $.math_cmd_expr_option),
            ),
          ),
        ),
      ),

    math_cmd_expr_arg: ($) => seq($._math_cmd_expr_arg_inner),

    math_cmd_expr_option: ($) => seq("?:", $._math_cmd_expr_arg_inner),

    _math_cmd_expr_arg_inner: ($) =>
      choice(
        seq("{", $.math, "}"),
        seq("!", $.inline_text),
        seq("!", "<", $.vertical, ">"),
        seq("!", "(", $._expr, ")"),
        // seq("!", $.list),
        // seq("!", $.record),
      ),

    //$1 const_rule

    literal_length: (_) => {
      const digits = /[0-9]+/;
      return token(choice(
        seq(optional("-"), digits, /[a-z]+/),
        seq(optional("-"), digits, ".", optional(digits), /[a-z]+/),
        seq(optional("-"), optional(digits), ".", digits, /[a-z]+/),
      ));
    },

    literal_int: (_) =>
      token(choice(
        seq(
          choice("0x", "0X"),
          repeat1(/[A-F0-9]/),
        ),
        repeat1(/[0-9]/),
      )),

    literal_float: (_) => {
      const digits = repeat1(/[0-9]/);

      return token(
        choice(
          seq(digits, ".", optional(digits)),
          seq(optional(digits), ".", digits),
        ),
      );
    },

    var_name: (_) => VARIABLE_NAME,
    type_name: (_) => VARIABLE_NAME,
    variant_name: (_) => MODULE_NAME,

    inline_cmd_name: (_) => INLINE_CMD_NAME,
    math_cmd_name: (_) => INLINE_CMD_NAME,
    block_cmd_name: (_) => BLOCK_CMD_NAME,
  },
});

function sep(rule, delimiter) {
  return seq(rule, repeat(seq(delimiter, rule)));
}

function optseq(rule) {
  return seq(rule, repeat(seq(delimiter, rule)));
}
