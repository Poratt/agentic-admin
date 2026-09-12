import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { RedditSearchService } from './reddit-search.service';
import { WebSearchController } from './web-search.controller';
import { WebSearchService } from './web-search.service';

@Module({
  imports: [HttpModule],
  controllers: [WebSearchController],
  providers: [WebSearchService, RedditSearchService],
  exports: [WebSearchService],
})
export class WebSearchModule {}
