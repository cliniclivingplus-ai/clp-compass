// Static "power plate" and grocery-list reference content — not patient-specific
// data, so it's the one thing in the guide that's the same for everyone. Shared
// by the web dashboard and the downloadable HTML export so they never drift.
export type MealType = 'breakfast' | 'lunch' | 'dinner'

export const FOOD_PLATES: Record<MealType, { ratios: string; columns: { head: string; items: string[] }[] }> = {
  breakfast: { ratios: '40% fruit · 30% whole grains · 30% protein', columns: [
    { head: 'Fruit', items: ['Apple', 'Banana', 'Papaya', 'Pear', 'Orange', 'Berries', 'Pomegranate', 'Kiwi'] },
    { head: 'Whole grains', items: ['Oats', 'Whole wheat', 'Barley', 'Brown rice', 'Ragi', 'Jowar', 'Quinoa', 'Buckwheat'] },
    { head: 'Protein', items: ['Almonds', 'Walnuts', 'Brazil nuts', 'Chia seeds', 'Flaxseeds', 'Pumpkin seeds', 'Tofu', 'Soy milk'] },
  ] },
  lunch: { ratios: '40% vegetables · 30% grains/millets · 30% lentils/protein', columns: [
    { head: 'Vegetables', items: ['Broccoli', 'Cauliflower', 'Kale', 'Cabbage', 'Spinach', 'Beet leaves', 'Celery', 'Watercress'] },
    { head: 'Grains/millets', items: ['Brown rice', 'Quinoa', 'Ragi', 'Jowar', 'Bajra', 'Foxtail millet', 'Barley', 'Oats'] },
    { head: 'Lentils/protein', items: ['Moong dal', 'Masoor dal', 'Chana', 'Toor dal', 'Rajma', 'Tofu', 'Tempeh', 'Hummus'] },
  ] },
  dinner: { ratios: '40% vegetables · 30% grains/millets · 30% lentils/protein', columns: [
    { head: 'Vegetables', items: ['Cruciferous veg', 'Mushroom', 'Zucchini', 'Bell pepper', 'Pumpkin', 'Ridge gourd', 'Bottle gourd', 'Asparagus'] },
    { head: 'Grains/millets', items: ['Quinoa', 'Buckwheat', 'Amaranth', 'Millet roti', 'Foxtail millet', 'Barley', 'Jowar roti', 'Brown rice'] },
    { head: 'Lentils/protein', items: ['Lentil soup', 'Tofu', 'Tempeh', 'Moong salad', 'Masoor dal', 'Chickpea', 'Edamame', 'Sprouts'] },
  ] },
}

export const GROCERY_CATEGORIES: { head: string; items: string[] }[] = [
  { head: 'Fruit', items: ['Apple', 'Banana', 'Papaya', 'Pear', 'Orange', 'Berries', 'Pomegranate', 'Kiwi'] },
  { head: 'Vegetables', items: ['Broccoli', 'Cauliflower', 'Kale', 'Cabbage', 'Spinach', 'Bell pepper', 'Pumpkin', 'Zucchini', 'Mushroom', 'Ridge gourd', 'Bottle gourd', 'Asparagus'] },
  { head: 'Grains & millets', items: ['Oats', 'Brown rice', 'Ragi', 'Jowar', 'Bajra', 'Quinoa', 'Buckwheat', 'Amaranth', 'Foxtail millet', 'Barley'] },
  { head: 'Lentils & protein', items: ['Moong dal', 'Masoor dal', 'Chana', 'Toor dal', 'Rajma', 'Tofu', 'Tempeh', 'Edamame', 'Sprouts', 'Hummus'] },
  { head: 'Nuts & seeds', items: ['Almonds', 'Walnuts', 'Brazil nuts', 'Chia seeds', 'Flaxseeds', 'Pumpkin seeds'] },
  { head: 'Other', items: ['Soy milk', 'Whole wheat'] },
]
