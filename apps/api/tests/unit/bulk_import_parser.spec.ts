import { test } from '@japa/runner'
import { parseBulkImport } from '#services/bulk_import_parser'

test.group('parseBulkImport — plain one-item-per-line format', () => {
  test('splits lines into items, ignoring blank lines', ({ assert }) => {
    const result = parseBulkImport('Milk\nBread\n\nChicken breast')
    assert.deepEqual(result, {
      sections: [
        {
          header: null,
          items: [
            { name: 'Milk', notes: [] },
            { name: 'Bread', notes: [] },
            { name: 'Chicken breast', notes: [] },
          ],
        },
      ],
    })
  })

  test('trims whitespace and strips superfluous characters from each line', ({ assert }) => {
    const result = parseBulkImport('  Milk   Bread  \n\n \t Eggs\u0007 \n')
    assert.deepEqual(
      result.sections[0]!.items.map((item) => item.name),
      ['Milk Bread', 'Eggs']
    )
  })

  test('drops lines that clean down to nothing', ({ assert }) => {
    const result = parseBulkImport('\u0000\nMilk\n')
    assert.deepEqual(
      result.sections[0]!.items.map((item) => item.name),
      ['Milk']
    )
  })
})

test.group('parseBulkImport — structured AnyList format', () => {
  test('parses an AnyList export: title, caps headers, bulleted items, notes, blank-line sections', ({
    assert,
  }) => {
    const text = `Shopping List

CHEMIST
• Amber Meds
Prescription

SPECIALS
• Glass container credits (149)

PRODUCE
• Blueberries

MEAT
• Rump cap

BAKERY
• Raisin Toast

SNACKS
• Arnott's Country Cheese Crackers

BREAKFAST & CEREAL
• Quick Rolled Oats

BEVERAGES
• Dilmah tea bags

COOKING
• Ground Coriander
• Cumin Seed
• Cumin
• Cayenne Chili Powder
• Chipotle Chili Powder

FROZEN
• Frozen fish for tacos`

    const result = parseBulkImport(text)
    assert.deepEqual(
      result.sections.map((section) => section.header),
      [
        'CHEMIST',
        'SPECIALS',
        'PRODUCE',
        'MEAT',
        'BAKERY',
        'SNACKS',
        'BREAKFAST & CEREAL',
        'BEVERAGES',
        'COOKING',
        'FROZEN',
      ]
    )

    assert.deepEqual(result.sections[0]!.items, [{ name: 'Amber Meds', notes: ['Prescription'] }])
    assert.deepEqual(result.sections[1]!.items, [
      { name: 'Glass container credits (149)', notes: [] },
    ])
    assert.deepEqual(
      result.sections[8]!.items.map((item) => item.name),
      ['Ground Coriander', 'Cumin Seed', 'Cumin', 'Cayenne Chili Powder', 'Chipotle Chili Powder']
    )
  })

  test('does not require a title or a leading blank line', ({ assert }) => {
    const result = parseBulkImport('PRODUCE\n• Blueberries\nMEAT\n• Rump cap')
    assert.deepEqual(
      result.sections.map((section) => [section.header, section.items[0]!.name]),
      [
        ['PRODUCE', 'Blueberries'],
        ['MEAT', 'Rump cap'],
      ]
    )
  })

  test('strips bullet markers of any kind from item names', ({ assert }) => {
    const result = parseBulkImport(
      'PRODUCE\n- Blueberries\n* Apples\n– Bananas\n— Cherries\n· Dates'
    )
    assert.deepEqual(
      result.sections[0]!.items.map((item) => item.name),
      ['Blueberries', 'Apples', 'Bananas', 'Cherries', 'Dates']
    )
  })

  test('treats a bullet marker with no name as a blank line', ({ assert }) => {
    const result = parseBulkImport('PRODUCE\n• Blueberries\n•\n• Apples')
    assert.deepEqual(
      result.sections[0]!.items.map((item) => item.name),
      ['Blueberries', 'Apples']
    )
  })

  test('keeps multiple bare lines under an item as its notes', ({ assert }) => {
    const result = parseBulkImport('CHEMIST\n• Amber Meds\nPrescription\nRefill monthly')
    assert.deepEqual(result.sections[0]!.items[0]!.notes, ['Prescription', 'Refill monthly'])
  })

  test('treats a bare numeric line as a note, not a category header', ({ assert }) => {
    const result = parseBulkImport('CHEMIST\n• Amber Meds\n149')
    assert.deepEqual(result.sections[0]!.items[0]!.notes, ['149'])
  })

  test('skips bare lines that clean down to nothing, whether as notes or items', ({ assert }) => {
    const result = parseBulkImport(
      'CHEMIST\n• Amber Meds\n\u0000\n\nPRODUCE\n\u0000\n• Blueberries'
    )
    assert.deepEqual(
      result.sections.map((section) => [section.header, section.items[0]!.name]),
      [
        ['CHEMIST', 'Amber Meds'],
        ['PRODUCE', 'Blueberries'],
      ]
    )
    assert.deepEqual(result.sections[0]!.items[0]!.notes, [])
  })

  test('a bare line after a blank line is an item, not a note', ({ assert }) => {
    const result = parseBulkImport('• Amber Meds\nPrescription\n\nMore meds')
    assert.deepEqual(
      result.sections[0]!.items.map((item) => item.name),
      ['Amber Meds', 'More meds']
    )
    assert.deepEqual(result.sections[0]!.items[0]!.notes, ['Prescription'])
  })

  test('an out-of-format bare line before any item is kept as an item', ({ assert }) => {
    const result = parseBulkImport('Oatmeal\nPRODUCE\n• Blueberries')
    assert.deepEqual(
      result.sections.map((section) => [section.header, section.items.map((item) => item.name)]),
      [
        [null, ['Oatmeal']],
        ['PRODUCE', ['Blueberries']],
      ]
    )
  })

  test('bullet items pasted before the first header are kept in an uncategorized section', ({
    assert,
  }) => {
    const result = parseBulkImport('• Milk\n\nPRODUCE\n• Blueberries')
    assert.deepEqual(
      result.sections.map((section) => [section.header, section.items.map((item) => item.name)]),
      [
        [null, ['Milk']],
        ['PRODUCE', ['Blueberries']],
      ]
    )
  })

  test('handles CRLF line endings', ({ assert }) => {
    const result = parseBulkImport('PRODUCE\r\n• Blueberries\r\n• Apples')
    assert.deepEqual(
      result.sections[0]!.items.map((item) => item.name),
      ['Blueberries', 'Apples']
    )
  })

  test('drops empty sections', ({ assert }) => {
    const result = parseBulkImport('CHEMIST\n\nPRODUCE\n• Blueberries')
    assert.deepEqual(
      result.sections.map((section) => [section.header, section.items[0]!.name]),
      [['PRODUCE', 'Blueberries']]
    )
  })

  test('a title line is only skipped when a blank line follows it', ({ assert }) => {
    const skipped = parseBulkImport('Shopping List\n\nPRODUCE\n• Blueberries')
    assert.deepEqual(
      skipped.sections.map((section) => [section.header, section.items[0]!.name]),
      [['PRODUCE', 'Blueberries']]
    )

    const kept = parseBulkImport('Oatmeal\nPRODUCE\n• Blueberries')
    assert.deepEqual(
      kept.sections.map((section) => [section.header, section.items[0]!.name]),
      [
        [null, 'Oatmeal'],
        ['PRODUCE', 'Blueberries'],
      ]
    )
  })
})
