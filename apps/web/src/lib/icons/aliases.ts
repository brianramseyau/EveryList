/**
 * @mdi/js only has a literal icon for a fraction of the things a grocery
 * category or item might be named — there's no "milk", "onion", or
 * "detergent" glyph. Searching the icon picker for those words used to come
 * back empty, forcing a trip to a web search (see AGENTS.md's referenced
 * issue). This maps common shopping-list words to the closest icon(s)
 * actually shipped by @mdi/js, so the picker's search and its
 * category-name-seeded suggestions can surface something relevant.
 *
 * Keys are lowercase search terms; values are stored icon names (the
 * `Category.icon` convention — see `./mdi.ts`), ordered most-relevant
 * first. Every target here has been checked against the installed
 * `@mdi/js` version to make sure it actually exists.
 */
export const ICON_ALIASES: Record<string, string[]> = {
	// Produce
	fruit: ['fruitCherries', 'foodApple', 'fruitGrapes', 'fruitWatermelon', 'fruitPineapple'],
	fruits: ['fruitCherries', 'foodApple', 'fruitGrapes', 'fruitWatermelon', 'fruitPineapple'],
	vegetable: ['carrot', 'corn', 'mushroom', 'pumpkin'],
	vegetables: ['carrot', 'corn', 'mushroom', 'pumpkin'],
	produce: ['fruitCherries', 'carrot', 'foodApple'],
	apple: ['foodApple'],
	apples: ['foodApple'],
	cherry: ['fruitCherries'],
	cherries: ['fruitCherries'],
	grape: ['fruitGrapes'],
	grapes: ['fruitGrapes'],
	pear: ['fruitPear'],
	pears: ['fruitPear'],
	watermelon: ['fruitWatermelon'],
	pineapple: ['fruitPineapple'],
	citrus: ['fruitCitrus'],
	orange: ['fruitCitrus'],
	oranges: ['fruitCitrus'],
	lemon: ['fruitCitrus'],
	lemons: ['fruitCitrus'],
	lime: ['fruitCitrus'],
	limes: ['fruitCitrus'],
	banana: ['fruitCherries', 'foodApple'],
	bananas: ['fruitCherries', 'foodApple'],
	berry: ['fruitCherries'],
	berries: ['fruitCherries'],
	strawberry: ['fruitCherries'],
	strawberries: ['fruitCherries'],
	carrot: ['carrot'],
	carrots: ['carrot'],
	corn: ['corn'],
	mushroom: ['mushroom'],
	mushrooms: ['mushroom'],
	pumpkin: ['pumpkin'],
	potato: ['carrot'],
	potatoes: ['carrot'],
	onion: ['carrot'],
	onions: ['carrot'],
	tomato: ['carrot'],
	tomatoes: ['carrot'],
	garlic: ['carrot'],
	salad: ['carrot'],
	lettuce: ['carrot'],
	greens: ['carrot'],

	// Dairy & eggs
	dairy: ['cheese', 'egg', 'cup'],
	milk: ['cup', 'babyBottle'],
	cheese: ['cheese'],
	egg: ['egg'],
	eggs: ['egg'],
	yogurt: ['cup'],
	yoghurt: ['cup'],
	butter: ['cheese'],
	cream: ['cup'],

	// Meat & seafood
	meat: ['foodDrumstick', 'foodSteak'],
	chicken: ['foodDrumstick'],
	poultry: ['foodDrumstick', 'turkey'],
	turkey: ['turkey'],
	drumstick: ['foodDrumstick'],
	steak: ['foodSteak'],
	beef: ['foodSteak'],
	pork: ['foodSteak'],
	bacon: ['foodSteak'],
	sausage: ['sausage'],
	sausages: ['sausage'],
	fish: ['fish'],
	seafood: ['fish'],
	shrimp: ['fish'],

	// Bakery & grains
	bread: ['breadSlice'],
	bakery: ['breadSlice', 'cupcake'],
	bagel: ['breadSlice'],
	bagels: ['breadSlice'],
	baguette: ['baguette'],
	cake: ['cakeVariant'],
	cupcake: ['cupcake'],
	cupcakes: ['cupcake'],
	donut: ['iceCream'],
	donuts: ['iceCream'],
	rice: ['rice'],
	pasta: ['pasta'],
	noodle: ['noodles'],
	noodles: ['noodles'],
	grain: ['grain'],
	grains: ['grain'],
	cereal: ['grain'],

	// Snacks & sweets
	snack: ['cookie', 'popcorn', 'pretzel'],
	snacks: ['cookie', 'popcorn', 'pretzel'],
	cookie: ['cookie'],
	cookies: ['cookie'],
	candy: ['candy'],
	sweets: ['candy', 'cookie'],
	chocolate: ['candy'],
	chip: ['chip'],
	chips: ['chip'],
	popcorn: ['popcorn'],
	pretzel: ['pretzel'],
	nut: ['nut'],
	nuts: ['nut'],
	peanut: ['peanut'],
	peanuts: ['peanut'],

	// Drinks
	drink: ['cup', 'bottleSoda'],
	drinks: ['cup', 'bottleSoda'],
	beverage: ['cup', 'bottleSoda'],
	beverages: ['cup', 'bottleSoda'],
	soda: ['bottleSoda'],
	pop: ['bottleSoda'],
	water: ['water', 'cupWater'],
	juice: ['cupWater'],
	coffee: ['coffee'],
	tea: ['tea'],
	beer: ['beer'],
	wine: ['bottleWine', 'glassWine'],
	alcohol: ['bottleWine', 'beer'],

	// Pantry & condiments
	pantry: ['cupboard'],
	sauce: ['soySauce'],
	sauces: ['soySauce'],
	soy: ['soySauce'],
	oil: ['oil'],
	spice: ['chiliMedium'],
	spices: ['chiliMedium'],
	chili: ['chiliMedium'],
	chilli: ['chiliMedium'],
	pepper: ['chiliMedium'],
	honey: ['spoonSugar'],
	sugar: ['spoonSugar'],
	jar: ['cupboard'],

	// Frozen
	frozen: ['snowflake'],
	ice: ['snowflake', 'iceCream'],

	// Household & cleaning
	household: ['spray'],
	cleaning: ['spray', 'sprayBottle', 'broom'],
	clean: ['spray', 'sprayBottle'],
	detergent: ['sprayBottle'],
	soap: ['sprayBottle'],
	broom: ['broom'],
	toilet: ['toilet'],
	paper: ['notebook'],

	// Health & baby
	health: ['pill'],
	pharmacy: ['pill', 'bottleTonic'],
	medicine: ['pill', 'bottleTonic'],
	vitamin: ['pill'],
	vitamins: ['pill'],
	baby: ['baby', 'babyBottle', 'babyCarriage'],

	// Pets
	pet: ['paw', 'dog', 'cat'],
	pets: ['paw', 'dog', 'cat'],
	dog: ['dog'],
	cat: ['cat'],

	// Misc / structural
	cart: ['cart'],
	basket: ['basket'],
	shopping: ['cart', 'basket'],
	bag: ['bagPersonal'],
	bags: ['bagPersonal'],
	box: ['box'],
	toy: ['toyBrick'],
	toys: ['toyBrick'],
	book: ['book'],
	books: ['book'],
	flower: ['flower'],
	flowers: ['flower'],
	plant: ['flower'],
	plants: ['flower'],
	other: ['dotsHorizontalCircle'],
	misc: ['dotsHorizontalCircle']
};

/** Reverse index (icon name -> the keywords that map to it), built once so
 * search can look up "does this icon have any aliases" in O(1). */
const ICON_KEYWORDS: Map<string, string[]> = new Map();
for (const [keyword, icons] of Object.entries(ICON_ALIASES)) {
	for (const icon of icons) {
		const existing = ICON_KEYWORDS.get(icon);
		if (existing) existing.push(keyword);
		else ICON_KEYWORDS.set(icon, [keyword]);
	}
}

/** The alias keywords (if any) that point at a given stored icon name. */
export function getIconKeywords(iconName: string): string[] {
	return ICON_KEYWORDS.get(iconName) ?? [];
}

function wordsOf(text: string): string[] {
	return text.toLowerCase().match(/[a-z]+/g) ?? [];
}

/** Icon names aliased to the words in `text` (e.g. a category/list name),
 * most-relevant first. Tries each word as typed, and its naive singular
 * (stripping a trailing "s") so "Vegetables" still finds "vegetable"'s
 * entry even though the word itself isn't a key. */
export function hintedIcons(text: string): string[] {
	const icons: string[] = [];
	for (const word of wordsOf(text)) {
		const singular = word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : null;
		for (const candidate of singular ? [word, singular] : [word]) {
			const found = ICON_ALIASES[candidate];
			if (found) icons.push(...found);
		}
	}
	return icons;
}
