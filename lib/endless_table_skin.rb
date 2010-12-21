# EndlessTableSkin
require 'active_support'
module EndlessTableSkin
  mattr_reader :default_actions, :html_options
  @@default_actions = ActiveSupport::OrderedHash.new #[{:new => {}}, :edit, :delete, :refresh]
  @@html_options = { :check_interval=>1, :scroll_threshold=>50, :error_threshold=>3, :outer_height=>200 }
  @@default_actions[:new]     = {:label => I18n.t("actions.new"),
    :url=>"%s/new", :image=>"/images/endless/new.png",
    :onclick => "Endless.Button.activateNew(this)"
  }
  @@default_actions[:edit]    = {:label => I18n.t("actions.edit"),
    :url=>"%s/:id/edit", :image=>"/images/endless/edit.png",
    :onSelectionChanged =>"Endless.Button.adjustForOne(source,event)",
    :onclick => "Endless.Button.activateEdit(this)"
  }
  @@default_actions[:delete]  = {:label => I18n.t("actions.delete"),
    :url=>"%s/:id", :image=>"/images/endless/delete.png",
    :onSelectionChanged =>"Endless.Button.adjustForMore(source,event)",
    :onclick => "Endless.Button.activateDelete(this)"
  }
  @@default_actions[:refresh] = {:label => I18n.t("actions.refresh"),
    :url=>"%s", :image=>"/images/endless/refresh.png",
    :onclick => "Endless.Button.activateRefresh(this)"
  }


  def self.output_html_options
    html_options.map do |k,v|
      "%s='%s'" % [k.to_s.camelize(:lower),v]
    end.join(" ")
  end

end