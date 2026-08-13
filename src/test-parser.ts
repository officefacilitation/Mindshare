import { parseNoteContent } from './lib/parser';
import { parseSearchQuery, filterNotes } from './lib/search';
import { Note } from './lib/types';

console.log("=== RUNNING MINDSHARE PARSER & SEARCH ENGINE TEST SUITE ===");

const testCases = [
  {
    input: "Fix @bug in #frontend code",
    expectedTags: ["frontend"],
    expectedMentions: ["bug"],
  },
  {
    input: "Email bob@company.com about #deploy",
    expectedTags: ["deploy"],
    expectedMentions: [], // bob@company.com should NOT parse as @company mention!
  },
  {
    input: "@Alice and @bob review https://docs.com#section",
    expectedTags: [], // https://docs.com#section is a URL anchor!
    expectedMentions: ["alice", "bob"],
  },
  {
    input: "#123tag or #tag123?",
    expectedTags: ["123tag", "tag123"],
    expectedMentions: [],
  },
  {
    input: "@ without name and # alone",
    expectedTags: [],
    expectedMentions: [],
  },
  {
    input: "##double #tag",
    expectedTags: ["double", "tag"],
    expectedMentions: [],
  },
  {
    input: "note with #tag1 #tag2 #tag3 #tag3 #tag3",
    expectedTags: ["tag1", "tag2", "tag3"], // Deduplicated!
    expectedMentions: [],
  },
  {
    input: "@Yashi @Yashi duplicate mention test",
    expectedTags: [],
    expectedMentions: ["yashi"], // Deduplicated!
  },
  {
    input: "Case test #Salary vs #salary",
    expectedTags: ["salary"], // Normalized!
    expectedMentions: [],
  },
  {
    input: "Special user handles @user.name and @Username-with-dashes",
    expectedTags: [],
    expectedMentions: ["user.name", "username-with-dashes"],
  }
];

let passedCount = 0;
let totalCount = testCases.length;

testCases.forEach((tc, idx) => {
  const result = parseNoteContent(tc.input);
  const tagsMatch = JSON.stringify(result.tags.sort()) === JSON.stringify(tc.expectedTags.sort());
  const mentionsMatch = JSON.stringify(result.mentions.sort()) === JSON.stringify(tc.expectedMentions.sort());

  if (tagsMatch && mentionsMatch) {
    passedCount++;
    console.log(`✅ [Pass ${idx + 1}] "${tc.input}" -> Tags: [${result.tags.join(', ')}], Mentions: [${result.mentions.join(', ')}]`);
  } else {
    console.error(`❌ [FAIL ${idx + 1}] "${tc.input}"`);
    console.error(`   Expected Tags:`, tc.expectedTags, `Got:`, result.tags);
    console.error(`   Expected Mentions:`, tc.expectedMentions, `Got:`, result.mentions);
  }
});

console.log(`\n=== PARSER TEST SUMMARY: ${passedCount} / ${totalCount} PASSED ===\n`);

// Search Engine Tests
console.log("=== TESTING SEARCH ENGINE BOOLEAN LOGIC ===");
const sampleNotes: Note[] = [
  { id: '1', user_id: 'u1', content: "Note 1 with #Finance and @Yashi", created_at: '', updated_at: '', tags: [{id:'1', name:'finance'}], mentions: [{id:'1', username:'yashi', display_name:'', contact_email:'', is_registered:true, status:'active'}] },
  { id: '2', user_id: 'u1', content: "Note 2 with #Frontend and #Finance", created_at: '', updated_at: '', tags: [{id:'1', name:'finance'}, {id:'2', name:'frontend'}], mentions: [] },
  { id: '3', user_id: 'u1', content: "Note 3 with gateway payment", created_at: '', updated_at: '', tags: [], mentions: [] },
];

// Test 1: AND query #Finance AND @Yashi
const q1 = parseSearchQuery("#Finance AND @Yashi");
const r1 = filterNotes(sampleNotes, q1);
console.log(`Search "#Finance AND @Yashi" matched ${r1.length} notes (Expected 1)`);

// Test 2: OR query #Frontend OR gateway
const q2 = parseSearchQuery("#Frontend OR gateway");
const r2 = filterNotes(sampleNotes, q2);
console.log(`Search "#Frontend OR gateway" matched ${r2.length} notes (Expected 2)`);

if (passedCount === totalCount && r1.length === 1 && r2.length === 2) {
  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! PARSER & SEARCH ENGINE VERIFIED 100% CORRECT.\n");
} else {
  if (typeof process !== 'undefined') process.exit(1);
}
