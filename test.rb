require 'scraperwiki'
require 'yaml'

File.delete("./data.sqlite") if File.exist?("./data.sqlite")

system("node scraper.js")

results_other = ScraperWiki.select("* from data order by council_reference")
results_other = results_other.map do |result|
  result.delete("id")
  result
end
File.open("results_other.yml", "w") do |f|
  f.write(results_other.to_yaml)
end

ScraperWiki.close_sqlite

File.delete("./data.sqlite") if File.exist?("./data.sqlite")

system("bundle exec ruby scraper.rb")

results_ruby = ScraperWiki.select("* from data order by council_reference")
File.open("results_ruby.yml", "w") do |f|
  f.write(results_ruby.to_yaml)
end

unless results_other == results_ruby
  system("diff results_other.yml results_ruby.yml")
  raise "Failed"
end
puts "Succeeded"
