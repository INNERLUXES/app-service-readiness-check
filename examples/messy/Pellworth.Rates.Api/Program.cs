using Pellworth.Rates.Api;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://*:5080");
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession();
builder.Services.AddHostedService<RateRefresher>();
builder.Services.AddControllers();

var app = builder.Build();
app.UseSession();
app.MapControllers();
app.Run();
