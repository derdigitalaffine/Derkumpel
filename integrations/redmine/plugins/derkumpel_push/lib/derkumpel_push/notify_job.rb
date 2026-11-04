require 'net/http'
require 'json'
require 'uri'

module DerkumpelPush
  class NotifyJob < ActiveJob::Base
    queue_as :default
    retry_on Net::OpenTimeout, Net::ReadTimeout, SocketError, wait: 15.seconds, attempts: 3

    def perform(event)
      base = ENV['DERKUMPEL_PUSH_URL'].to_s
      token = ENV['DERKUMPEL_PUSH_EVENT_TOKEN'].to_s
      return if base.empty? || token.length < 32

      uri = URI.parse(base)
      unless uri.is_a?(URI::HTTPS) && uri.userinfo.nil? && uri.host
        Rails.logger.error('[derkumpel_push] DERKUMPEL_PUSH_URL must be an HTTPS URL')
        return
      end
      uri.path = '/api/push/events'
      uri.query = nil
      uri.fragment = nil
      request = Net::HTTP::Post.new(uri.request_uri)
      request['Content-Type'] = 'application/json'
      request['X-DerKumpel-Event-Token'] = token
      request.body = JSON.generate(event)

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true,
                                 open_timeout: 3, read_timeout: 7,
                                 verify_mode: OpenSSL::SSL::VERIFY_PEER) { |http| http.request(request) }
      if response.code.to_i >= 500
        raise Net::ReadTimeout, "DerKumpel push endpoint returned #{response.code}"
      elsif response.code.to_i >= 400
        Rails.logger.error("[derkumpel_push] Event rejected (#{response.code}); check token and configuration")
      end
    end
  end
end
