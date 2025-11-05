// Test script to manually trigger the scheduled job

async function testScheduler() {
  console.log("Testing manual scheduler trigger...\n");
  
  const adminToken = process.env.ADMIN_TOKEN;
  
  if (!adminToken) {
    console.error("ERROR: ADMIN_TOKEN not set");
    process.exit(1);
  }
  
  const response = await fetch("http://localhost:5000/api/trigger-job", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      scrapeLimit: 20,
      analysisLimit: 10,
      channelName: "community-support",
    }),
  });
  
  const result = await response.json();
  
  if (response.ok) {
    console.log("✓ Job triggered successfully!");
    console.log(result);
    console.log("\nCheck the server logs for job progress...");
  } else {
    console.error("ERROR:", result);
    process.exit(1);
  }
}

testScheduler().catch(error => {
  console.error("ERROR:", error.message);
  process.exit(1);
});
